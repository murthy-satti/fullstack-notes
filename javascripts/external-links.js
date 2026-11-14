function setExternalLinksToOpenInNewTabs() {
  document.querySelectorAll("a[href]").forEach((link) => {
    const url = new URL(link.href, window.location.href);

    if (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.origin !== window.location.origin
    ) {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
  });
}

if (typeof document$ !== "undefined") {
  document$.subscribe(setExternalLinksToOpenInNewTabs);
} else {
  document.addEventListener("DOMContentLoaded", setExternalLinksToOpenInNewTabs);
}
