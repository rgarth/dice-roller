# Dice roller

3D dice for the browser. It runs on a desktop and on a phone. It is a static page, with no framework and no server, so it stays light. The page caches itself, and after the first visit it opens offline and still rolls.

Hosted demo: https://rgarth.github.io/dice-roller/

It ships a build of [Three.js](https://threejs.org/) r186 in `vendor/three`.

## Games

A standard set of polyhedral dice for most tabletop games, such as 5e, and for any game that needs dice.

It also rolls for the Loner game engine and the Year Zero game engine.

A link can set the standard dice and roll them on open. eg, To roll a D20 and 2 D8:

https://rgarth.github.io/dice-roller/?d20=1&d8=2

## Local

```
python3 -m http.server
```

```
node --test
```

Pushes to `main` publish through `.github/workflows/publish.yml`.

## Licence

MIT. See `LICENSE`. Three.js, cannon.js, and the dice renderer in `vendor/` keep their own notices.
