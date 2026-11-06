# mongosh

mongosh is MongoDB's interactive JavaScript shell. It connects to local, self-managed, or Atlas deployments and is useful for learning, inspecting data, running administrative commands, and executing scripts. It is the current shell; old tutorials may refer to the legacy mongo shell.

## Connect and inspect

~~~sh
mongosh "mongodb://localhost:27017"
mongosh "mongodb+srv://user@cluster.example.mongodb.net/app"
~~~

Avoid placing passwords directly in shell commands, shell history, or logs. Use a secure prompt or secret handling appropriate to the environment.

~~~javascript
show dbs
use app
show collections
db.products.find({ active: true }).limit(10)
db.products.getIndexes()
db.products.countDocuments({ active: true })
~~~

The db helper refers to the selected database. Collection methods issue database operations. Use help, db.help(), and db.collection.help() for shell guidance. Scripts can be loaded and run from mongosh; scope them to an explicit database and make them safe to rerun.

Before destructive work, print the current database and deployment, inspect the filter with find(), and use a disposable collection for practice. Install and connection details are in the [mongosh documentation](https://www.mongodb.com/docs/mongodb-shell/).
