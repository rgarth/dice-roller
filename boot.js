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

try {
  await loadScript("vendor/cannon.min.js");
  await loadScript("vendor/dice.js?v=round2");
  window.dispatchEvent(new Event("dice-ready"));
} catch (error) {
  window.dispatchEvent(new CustomEvent("dice-failed", { detail: error }));
}
