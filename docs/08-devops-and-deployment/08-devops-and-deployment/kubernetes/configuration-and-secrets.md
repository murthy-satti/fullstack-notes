# Configuration and Secrets

One image should run in every environment, so everything that differs
between development, staging, and production (log levels, feature flags,
connection strings, API keys) must be supplied when the container starts.
Kubernetes provides two objects for this: **ConfigMaps** for ordinary
configuration and **Secrets** for sensitive values. This lesson covers how
both are created and consumed, why base64 is not encryption, how to
protect Secrets with encryption at rest and RBAC, the difference between
environment variables and mounted files (one updates, one does not), how
to roll Pods automatically when configuration changes, immutable
ConfigMaps, and the external tools teams use to keep real secrets out of
Git: the External Secrets Operator, the Secrets Store CSI Driver, and
Sealed Secrets.

## Why it matters

Configuration mistakes are among the most common causes of failed
deploys and security incidents. A changed ConfigMap that never reaches
running Pods leaves the cluster in a state nobody intended. A Secret
manifest committed to Git with base64 values is a plaintext password in
the repository history. A developer role that can create Pods can read
every Secret in its namespace by mounting it. Understanding exactly how
values flow from these objects into a process, and who can read them on
the way, prevents all three.

## Real-world usage

- **The Twelve-Factor App.** The [config](https://12factor.net/config)
  factor defines configuration as everything that varies between deploys
  and requires strict separation of config from code, which ConfigMaps
  and Secrets implement for Kubernetes workloads.
- **Kubernetes project.** The
  [good practices for Kubernetes Secrets](https://kubernetes.io/docs/concepts/security/secrets-good-practices/)
  page recommends enabling encryption at rest, applying least-privilege
  RBAC to Secrets, restricting which containers can access them, and
  considering external secret store providers.
- **Kubernetes project.** The
  [encrypting confidential data at rest](https://kubernetes.io/docs/tasks/administer-cluster/encrypt-data/)
  task shows that Secrets are stored unencrypted in etcd unless an
  encryption configuration (ideally a KMS provider) is set on the API
  server.
- **External Secrets Operator.** The
  [External Secrets Operator](https://external-secrets.io/latest/)
  project documents the controller pattern used by many teams to sync
  values from AWS Secrets Manager, HashiCorp Vault, Google Secret Manager,
  and Azure Key Vault into Kubernetes Secrets.

**Popular tools and providers:** External Secrets Operator, Secrets
Store CSI Driver, Sealed Secrets, SOPS, HashiCorp Vault, AWS Secrets
Manager, Google Secret Manager, Azure Key Vault, and Stakater Reloader for
restarting Pods on configuration changes.

## How it works

### ConfigMaps

A ConfigMap stores non-sensitive configuration as key-value pairs. Values
can be short strings (`LOG_LEVEL: info`) or whole files
(`features.json: |` followed by the file content). A ConfigMap is limited
to 1 MiB, lives in one namespace, and can be consumed only by Pods in that
namespace.

### Secrets

A Secret has the same shape but is meant for sensitive data. Kubernetes
treats Secrets slightly differently from ConfigMaps: they are sent only to
nodes that run Pods using them, mounted into containers on in-memory
tmpfs rather than disk, and can be protected separately by RBAC and
encryption at rest. Common types:

| Type | Use |
|------|-----|
| `Opaque` | Arbitrary key-value data (the default) |
| `kubernetes.io/tls` | A TLS certificate and key (`tls.crt`, `tls.key`) |
| `kubernetes.io/dockerconfigjson` | Registry credentials for `imagePullSecrets` |
| `kubernetes.io/basic-auth`, `kubernetes.io/ssh-auth` | Typed credentials |

### Base64 is encoding, not encryption

Values in a Secret's `data` field are base64-encoded so that binary data
fits in JSON and YAML. Anyone who can read the object can decode them in
one command:

```bash
kubectl -n taskflow get secret taskflow-api-secrets \
  -o jsonpath='{.data.mongodb-uri}' | base64 -d
```

You can write plain values under `stringData` instead; the API server
encodes them. Either way, a Secret manifest with real values is a
plaintext secret: it must not be committed to Git.

### Protecting Secrets

Three layers protect Secret values:

1. **Encryption at rest.** By default the API server stores Secrets in
   etcd unencrypted, so an etcd backup or disk is a copy of every
   credential. An `EncryptionConfiguration` makes the API server encrypt
   them before writing; the `kms` provider (version 2) uses envelope
   encryption with a key held in a cloud KMS or HSM, so the key never sits
   on the control plane disk. Managed services encrypt their etcd storage
   and offer KMS envelope encryption, enabled by default on some
   platforms; check yours.
2. **RBAC.** `get`, `list`, and `watch` on `secrets` reveal every value.
   Grant them only to the controllers and people that need them. Note
   that anyone who can **create Pods** in a namespace can mount any Secret
   in that namespace and read it, so Pod creation rights are effectively
   Secret read rights.
3. **Limiting exposure in the Pod.** Mount only the keys a container
   needs, prefer files over environment variables (environment variables
   end up in crash dumps, `/proc/<pid>/environ`, and child processes), and
   set restrictive file modes (`defaultMode: 0400`).

### Environment variables compared with mounted files

![Diagram: the ConfigMap taskflow-api-config (LOG_LEVEL, TASKS_PAGE_SIZE, features.json) and the Secret taskflow-api-secrets (type Opaque with base64-encoded mongodb-uri and jwt-secret) reach the taskflow-api Pod four ways: envFrom sets LOG_LEVEL and TASKS_PAGE_SIZE once at container start, a volume mount places /etc/taskflow/features.json as a file the kubelet updates in place, secretKeyRef sets MONGODB_URI once at start, and a secret volume mounts /var/run/secrets/taskflow/jwt-secret on in-memory tmpfs, also updated in place; env vars are read once while mounted files refresh except with subPath, and Secret values are only base64-encoded, so encryption at rest and RBAC matter.](config-into-pods.svg)

| | Environment variables | Mounted files |
|-|-----------------------|---------------|
| How | `env` with `valueFrom`, or `envFrom` for all keys | A `configMap` or `secret` volume |
| When the ConfigMap or Secret changes | **Never updated**; the process keeps the values it started with | **Updated in place** by the kubelet, typically within a minute or so |
| With `subPath` | Not applicable | Never updated |
| App support | Every app reads `process.env` | The app must read the file, and re-read it to pick up changes |
| Exposure | Visible to child processes and in process dumps | Readable only through the filesystem, with file permissions |
| Best for | Simple settings that change with a deploy | Secrets, larger files, settings that should change without a restart |

The kubelet updates mounted files atomically (it swaps a symbolic link to
a new directory), so an app that watches the file sees a complete new
version. Updating does not restart anything: if the app reads the file
only at startup, it still needs a restart.

### Rolling Pods when configuration changes

Because environment variables never update and many apps read files only
at startup, changing a ConfigMap usually requires new Pods. Kubernetes
does not do this by itself: a Deployment rolls out only when its Pod
template changes. Common patterns:

| Pattern | How it works |
|---------|--------------|
| `kubectl rollout restart deployment/taskflow-api` | Adds a timestamp annotation to the template, triggering a normal rolling update; manual |
| Checksum annotation (Helm) | The chart puts `checksum/config: <sha256 of the ConfigMap>` in the Pod template, so any config change changes the template |
| Generated names (Kustomize) | `configMapGenerator` appends a content hash to the ConfigMap name (`taskflow-api-config-7g8k2m`) and rewrites references, so a change produces a new name and a rollout |
| A reloader controller | A controller such as Stakater Reloader watches referenced ConfigMaps and Secrets and restarts the workload when they change |

Generated, hash-suffixed names also make rollbacks correct: rolling back
the Deployment points it at the old ConfigMap, which still exists, instead
of keeping the new configuration with the old code.

### Immutable ConfigMaps and Secrets

Setting `immutable: true` prevents any change to the object's data. The
kubelet stops watching immutable objects, which reduces load on the API
server in large clusters, and accidental edits that would affect running
Pods become impossible. To change the value you create a new object with
a new name and update the reference, which pairs naturally with
hash-suffixed names.

### External secret management

Keeping secret values in an external manager (a cloud secret manager or
Vault) gives you a single source of truth, auditing, rotation, and
access policies independent of the cluster. Three tools bring those
values into Kubernetes:

![Diagram: an ExternalSecret stored in Git tells the External Secrets Operator which keys to fetch; the operator authenticates to the external secret store (Secrets Manager, Vault, Key Vault, Secret Manager) with workload identity, fetches values, and writes the Secret taskflow-api-secrets, repeating every refreshInterval so rotations arrive; the Pod consumes it as files that update or env vars that need a rollout; three approaches compared: the External Secrets Operator syncs values into native Secrets, the Secrets Store CSI Driver mounts values into the Pod as files with optional syncing, and Sealed Secrets keeps encrypted values in Git for an in-cluster controller to decrypt.](external-secret-sync.svg)

| Tool | How it works | Strengths | Trade-offs |
|------|--------------|-----------|------------|
| External Secrets Operator | `ExternalSecret` objects (safe to commit) tell a controller which keys to copy from a `SecretStore` into native Secrets, refreshed on an interval | Apps unchanged; many providers; rotation flows through | Values still exist as Secrets in etcd |
| Secrets Store CSI Driver | A CSI volume mounts values from the store directly into the Pod at start; optional sync to a Secret | Values need never be stored in etcd | Pods depend on the store being reachable when they start |
| Sealed Secrets | `kubeseal` encrypts a Secret with the cluster's public key; the encrypted `SealedSecret` is committed; a controller decrypts it in the cluster | Pure GitOps; no external service | Rotation means re-sealing and committing; the controller's key must be backed up |

The controller authenticates to the cloud store with **workload
identity** (EKS Pod Identity or IAM roles for service accounts, GKE
Workload Identity Federation, Azure Workload Identity), which maps a
Kubernetes service account to a cloud identity so no long-lived cloud
key is stored in the cluster. Where secrets come from and how they are
rotated is covered in
[secrets management](../environment-variables/secrets-management.md).

### Other ways to feed configuration in

- **Command arguments** can reference environment variables with
  `$(VAR_NAME)` syntax in `command` and `args`.
- **The Downward API** exposes Pod metadata (name, namespace, labels, node
  name) and the container's own resource requests and limits as
  environment variables or files, useful for logging and for sizing a
  runtime from its limits.

## When to use and when not to use

| Value | Store it in | Deliver it as |
|-------|-------------|---------------|
| Log level, page sizes, public URLs, feature defaults | ConfigMap | Env vars, or a file if it should change live |
| A JSON or YAML config file | ConfigMap | Mounted file |
| Database password, API keys, signing keys | External secret manager, synced to a Secret | Mounted file (or env var if the app requires it) |
| TLS certificate and key | Secret of type `kubernetes.io/tls`, usually managed by cert-manager | Used by the Ingress or Gateway, or mounted |
| Registry credentials | `kubernetes.io/dockerconfigjson` Secret | `imagePullSecrets` |
| Values that differ per build of a frontend | Build arguments, not Kubernetes | Baked into static files at build time |

Do not put large data or binary blobs in ConfigMaps (the 1 MiB limit and
etcd load), do not store secrets in ConfigMaps, and do not rely on
Secrets alone as your secret management strategy without encryption at
rest and tight RBAC.

## Practical examples

### A ConfigMap and how the Secret is created

```yaml
# k8s/api-config.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: taskflow-api-config
  namespace: taskflow
data:
  LOG_LEVEL: info
  TASKS_PAGE_SIZE: "50"
  features.json: |
    {
      "taskComments": true,
      "taskReminders": false
    }
```

```bash
# Create the Secret from a CI secret or a local file, never from a committed manifest
kubectl -n taskflow create secret generic taskflow-api-secrets \
  --from-literal=mongodb-uri='mongodb://<user>:<password>@mongo.example.com:27017/taskflow' \
  --from-file=jwt-secret=./jwt-secret.txt

# Generate a manifest to inspect (do not commit it)
kubectl -n taskflow create secret generic demo --from-literal=key=value \
  --dry-run=client -o yaml

# Build the same ConfigMap from literals and a file
# (--from-env-file cannot be combined with --from-file or --from-literal)
kubectl -n taskflow create configmap taskflow-api-config \
  --from-literal=LOG_LEVEL=info --from-literal=TASKS_PAGE_SIZE=50 \
  --from-file=config/features.json \
  --dry-run=client -o yaml > k8s/api-config.yaml
```

### Consuming configuration in the Deployment

```yaml
# k8s/api-deployment.yaml (excerpt): pod template spec
spec:
  containers:
    - name: api
      image: ghcr.io/example/taskflow-api:1.4.0
      env:
        - name: LOG_LEVEL
          valueFrom:
            configMapKeyRef:
              name: taskflow-api-config
              key: LOG_LEVEL
        - name: TASKS_PAGE_SIZE
          valueFrom:
            configMapKeyRef:
              name: taskflow-api-config
              key: TASKS_PAGE_SIZE
        - name: MONGODB_URI
          valueFrom:
            secretKeyRef:
              name: taskflow-api-secrets
              key: mongodb-uri
        - name: JWT_SECRET_FILE
          value: /var/run/secrets/taskflow/jwt-secret
        - name: POD_NAME                     # Downward API
          valueFrom:
            fieldRef:
              fieldPath: metadata.name
      volumeMounts:
        - name: features
          mountPath: /etc/taskflow
          readOnly: true
        - name: secrets
          mountPath: /var/run/secrets/taskflow
          readOnly: true
  volumes:
    - name: features
      configMap:
        name: taskflow-api-config
        items:
          - key: features.json
            path: features.json
    - name: secrets
      secret:
        secretName: taskflow-api-secrets
        defaultMode: 0400
        items:
          - key: jwt-secret
            path: jwt-secret
```

The variables are listed explicitly because this ConfigMap also holds a
file. `envFrom` with a `configMapRef` would turn every key into a
variable, which is convenient for a ConfigMap of plain settings and
messy for one that contains files. The JWT
secret is read from a file whose path is passed in an environment
variable, a convention many libraries and images support (`*_FILE`).

### Reading a mounted file that can change

```js
// src/features.js: reload features.json when the kubelet updates it
import { readFileSync, watch } from "node:fs";

const DIR = "/etc/taskflow";
let features = load();

function load() {
  return JSON.parse(readFileSync(`${DIR}/features.json`, "utf8"));
}

// The kubelet swaps a symlink inside the directory, so watch the directory
watch(DIR, () => {
  try {
    features = load();
  } catch (err) {
    console.error("keeping previous features.json:", err);
  }
});

export const isEnabled = (name) => Boolean(features[name]);
```

### Rolling out on change with Kustomize and Helm

```yaml
# k8s/overlays/production/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: taskflow
resources:
  - ../../base
configMapGenerator:
  - name: taskflow-api-config
    envs:
      - production.env
    files:
      - features.json
```

```yaml
# charts/taskflow-api/templates/deployment.yaml (excerpt)
spec:
  template:
    metadata:
      annotations:
        checksum/config: {{ include (print $.Template.BasePath "/configmap.yaml") . | sha256sum }}
```

Kustomize generates `taskflow-api-config-<hash>` and updates the
Deployment's references; Helm changes the annotation whenever the
rendered ConfigMap changes. Both turn a config edit into a normal rolling
update.

### Encryption at rest on a self-managed control plane

```yaml
# /etc/kubernetes/enc/encryption-config.yaml (passed with --encryption-provider-config)
apiVersion: apiserver.config.k8s.io/v1
kind: EncryptionConfiguration
resources:
  - resources:
      - secrets
    providers:
      - aescbc:
          keys:
            - name: key1
              secret: <base64-encoded-32-byte-key>
      - identity: {}     # still able to read data written before encryption
```

```bash
# After restarting the API server, rewrite existing Secrets so they are encrypted
kubectl get secrets --all-namespaces -o json | kubectl replace -f -
```

The first provider encrypts new writes; later providers are used only
to read old data. In production prefer the `kms` provider so the key
lives in a KMS rather than in a file on the control plane.

### Syncing from AWS Secrets Manager with the External Secrets Operator

```yaml
# k8s/secret-store.yaml: how to reach the store (uses the Pod's service account identity)
apiVersion: external-secrets.io/v1
kind: SecretStore
metadata:
  name: aws-secrets
  namespace: taskflow
spec:
  provider:
    aws:
      service: SecretsManager
      region: us-east-1
      auth:
        jwt:
          serviceAccountRef:
            name: taskflow-api
---
# k8s/external-secret.yaml: what to fetch and which Secret to write
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: taskflow-api-secrets
  namespace: taskflow
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secrets
    kind: SecretStore
  target:
    name: taskflow-api-secrets
    creationPolicy: Owner
  data:
    - secretKey: mongodb-uri
      remoteRef:
        key: prod/taskflow/api
        property: mongodb_uri
    - secretKey: jwt-secret
      remoteRef:
        key: prod/taskflow/api
        property: jwt_secret
```

Both files are safe to commit: they contain references, not values. The
`taskflow-api` service account is mapped to an IAM role that may read only
`prod/taskflow/*`. Older External Secrets Operator releases serve these
kinds as `external-secrets.io/v1beta1`.

### An immutable, versioned ConfigMap

```yaml
# k8s/api-config-v7.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: taskflow-api-config-v7
  namespace: taskflow
immutable: true
data:
  LOG_LEVEL: info
  TASKS_PAGE_SIZE: "50"
```

## Best practices

- Build one image and inject all environment-specific values at runtime.
- Keep secret values out of Git: commit references (`ExternalSecret`) or
  encrypted forms (`SealedSecret`), never plain or base64 `Secret`
  manifests.
- Enable encryption at rest, preferably with a KMS provider.
- Restrict `get`, `list`, and `watch` on Secrets, and remember that Pod
  creation rights imply Secret read rights within a namespace.
- Prefer mounted files for secrets; mount only the keys a container
  needs, read-only, with mode `0400`.
- Make configuration changes roll Pods automatically (hash-suffixed names
  or checksum annotations).
- Use immutable ConfigMaps and Secrets with versioned names in large
  clusters.
- Use workload identity for access to cloud secret stores.
- Validate configuration at application startup and fail fast with a
  clear message.

## In production

- **A ConfigMap change has no effect.**
  *Detect:* `kubectl get configmap -o yaml` shows the new value, but
  `kubectl exec ... -- printenv LOG_LEVEL` shows the old one. *Cause:*
  environment variables are set only when the container starts, and
  nothing restarted the Pods. *Fix:* `kubectl rollout restart` now; use
  hash-suffixed ConfigMaps or a checksum annotation so future changes roll
  out automatically.
- **Pods fail with `CreateContainerConfigError`.**
  *Detect:* `kubectl describe pod` shows `secret "taskflow-api-secrets"
  not found` or `couldn't find key mongodb-uri`. *Cause:* the Secret or
  key does not exist in that namespace yet, often because the sync
  controller failed or the name changed. *Fix:* create or sync the Secret
  first, check the `ExternalSecret` status conditions, and mark optional
  references with `optional: true` only when the app truly works without
  them.
- **A database password is found in the Git history.**
  *Detect:* a secret scanner flags a `Secret` manifest with base64 values.
  *Cause:* someone committed a Secret, assuming base64 hides it. *Fix:*
  rotate the credential immediately, remove the file, move to the
  External Secrets Operator or Sealed Secrets, and add secret scanning to
  CI.
- **A mounted file never changes after an update.**
  *Detect:* the ConfigMap is updated, but `cat` inside the container shows
  the old content even after several minutes. *Cause:* the volume is
  mounted with `subPath`, which is never updated. *Fix:* mount the whole
  volume at a directory (with `items` to pick keys) or restart Pods on
  change.
- **Developers can read production credentials.**
  *Detect:* an RBAC review (`kubectl auth can-i get secrets
  --as=<user> -n taskflow`) or audit logs show reads by people who should
  not have them. *Cause:* broad roles in the namespace, including the right
  to create Pods that mount Secrets. *Fix:* separate namespaces or clusters
  for production, least-privilege roles, deployment only through CI or
  GitOps, and audit logging on Secret access.
- **A secret rotation causes an outage.**
  *Detect:* authentication errors spike right after a credential is
  rotated in the store. *Cause:* the old credential was revoked before all
  Pods picked up the new one (env vars need a restart; refresh intervals
  add delay). *Fix:* rotate with an overlap: create the new credential,
  let it propagate and roll Pods, then revoke the old one.

## Important terminology

- **ConfigMap:** An object holding non-sensitive configuration as
  key-value pairs or files.
- **Secret:** An object for sensitive values, base64-encoded in the API
  and handled more carefully by the kubelet.
- **`stringData`:** A write-only Secret field that accepts plain values
  and is encoded by the API server.
- **Encryption at rest:** Encrypting Secret data before it is written to
  etcd, configured with an `EncryptionConfiguration`.
- **KMS provider:** Envelope encryption where data keys are protected by a
  key in an external key management service.
- **`envFrom` / `valueFrom`:** Ways to turn ConfigMap and Secret keys into
  environment variables.
- **`subPath`:** Mounting a single file from a volume; such mounts never
  receive updates.
- **Immutable ConfigMap:** A ConfigMap or Secret with `immutable: true`
  whose data cannot change.
- **External Secrets Operator:** A controller that syncs values from
  external stores into Kubernetes Secrets.
- **Sealed Secrets:** Encrypted Secrets safe to commit, decrypted by an
  in-cluster controller.
- **Workload identity:** Mapping a Kubernetes service account to a cloud
  identity, avoiding stored cloud keys.

## Common mistakes and misconceptions

- Believing base64-encoded Secrets are encrypted.
- Committing Secret manifests to Git.
- Expecting environment variables to update when a ConfigMap changes.
- Using `subPath` for files that should update.
- Granting broad Pod-creation rights while trying to restrict Secret
  access.
- Storing large files or binary data in ConfigMaps.
- Changing a ConfigMap in place and breaking the ability to roll back
  configuration together with code.
- Logging the whole configuration object at startup, secrets included.

## Revision questions

1. What is the difference between a ConfigMap and a Secret, both in
   intended use and in how Kubernetes handles them?
2. Decode this Secret value: `dGFza2Zsb3c=`. What does that tell you
   about base64 as protection?
3. A ConfigMap value is consumed both as an environment variable and as a
   mounted file. You change it. What does the running process see in each
   case, and when?
4. Describe two ways to make a ConfigMap change roll out new Pods
   automatically.
5. Why does the right to create Pods in a namespace imply the right to
   read its Secrets?
6. What does encryption at rest protect against, and what does it not
   protect against?
7. Compare the External Secrets Operator, the Secrets Store CSI Driver,
   and Sealed Secrets.
8. Why would you mark a ConfigMap immutable?

## Further learning

- [Kubernetes documentation: ConfigMaps](https://kubernetes.io/docs/concepts/configuration/configmap/)
- [Kubernetes documentation: Secrets](https://kubernetes.io/docs/concepts/configuration/secret/)
- [Kubernetes documentation: Distribute credentials securely using Secrets](https://kubernetes.io/docs/tasks/inject-data-application/distribute-credentials-secure/)
- [Secrets Store CSI Driver](https://secrets-store-csi-driver.sigs.k8s.io/)
- [Sealed Secrets](https://github.com/bitnami-labs/sealed-secrets)
- Next: [health probes and rolling updates](health-probes-and-rolling-updates.md).
  Back to the [Kubernetes overview](../kubernetes.md).
