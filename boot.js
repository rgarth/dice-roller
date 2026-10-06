import * as THREE from "./vendor/three/three.module.js";

window.THREE = THREE;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(script);
  });
}

await loadScript("vendor/cannon.min.js");
await loadScript("vendor/dice.js?v=light5");
await loadScript("app.js?v=preview-data");
