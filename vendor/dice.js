"use strict";

/**
 * @brief generates polyhedral dice with roll animation and result calculation
 * @author Anton Natarov aka Teal (original author)
 * @author Sarah Rosanna Busch (refactor, see changelog)
 * @date 10 Aug 2023
 * @version 1.1
 * @dependencies teal.js, cannon.js, three.js
 */

/**
 * CHANGELOG
 * - tweaked scaling to make dice look nice on mobile
 * - removed dice selector feature (separating UI from dice roller)
 * - file reorg (moving variable declarations to top, followed by public then private functions)
 * - removing true random option (was cool but not worth the extra dependencies or complexity)
 * - removing mouse event bindings (separating UI from dice roller)
 * - refactoring to module pattern and reducing publically available properties/methods
 * - removing dice notation getter callback in favour of setting dice to roll directly
 * - adding sound effect
 * - adding roll results to notation returned in after_roll callback
 * - adding 'd9' option (d10 to be added to d100 properly)
 * - draw with Three.js r186 buffer geometry
 * - sample marble colour from inside the die
 * - round the bevel so the edge is a curve, not a flat cut
 * - add a large hundred-face die
 */

const DICE = (function() {
    var that = {};

    function copyto(target, source) {
        for (var key in source) {
            if (source.hasOwnProperty(key)) {
                target[key] = source[key];
            }
        }
        return target;
    }

    var vars = { //todo: make these configurable on init
        frame_rate: 1 / 60,
        scale: 85, //dice size (reduced by 15%)
        
        material_options: {
            specular: 0x172022,
            color: 0xf0f0f0,
            shininess: 40,
            flatShading: true,
        },
        label_color: '#c4a15a',
        dice_color: '#1a1a1a',
        label_font: 'Cinzel',
        label_weight: '400',
        use_marble: false,
        ambient_light_color: 0xf0f0f0,
        spot_light_color: 0xefefef,
        desk_color: '#14241c',
        desk_opacity: 0,
        use_shadows: true,
        use_adapvite_timestep: true //todo: setting this to false improves performace a lot. but the dice rolls don't look as natural...

    }

    const CONSTS = {
        known_types: ['d4', 'd6', 'd8', 'd9', 'd10', 'd12', 'd20', 'd100', 'd100s'],
        dice_face_range: { 'd4': [1, 4], 'd6': [1, 6], 'd8': [1, 8], 'd9': [0, 9], 'd10': [0, 9], 
            'd12': [1, 12], 'd20': [1, 20], 'd100': [0, 9], 'd100s': [1, 100] },
        dice_mass: { 'd4': 300, 'd6': 300, 'd8': 340, 'd9': 350, 'd10': 350, 'd12': 350, 'd20': 400, 'd100': 350, 'd100s': 480 },
        dice_inertia: { 'd4': 5, 'd6': 13, 'd8': 10, 'd9': 9, 'd10': 9, 'd12': 8, 'd20': 6, 'd100': 9, 'd100s': 12 },
        
        standart_d20_dice_face_labels: [' ', '0', '1', '2', '3', '4', '5', '6', '7', '8',
                '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'],
        standart_d100_dice_face_labels: [' ', '00', '10', '20', '30', '40', '50',
                '60', '70', '80', '90'],
                
        d4_labels: [
            [[], [0, 0, 0], [2, 4, 3], [1, 3, 4], [2, 1, 4], [1, 2, 3]],
            [[], [0, 0, 0], [2, 3, 4], [3, 1, 4], [2, 4, 1], [3, 2, 1]],
            [[], [0, 0, 0], [4, 3, 2], [3, 4, 1], [4, 2, 1], [3, 1, 2]],
            [[], [0, 0, 0], [4, 2, 3], [1, 4, 3], [4, 1, 2], [1, 3, 2]]
        ]
    }

    // DICE BOX OBJECT

    // @brief constructor; create a new instance of this to initialize the canvas
    // @param container element to contain canvas; canvas will fill container
    that.dice_box = function(container) {
        this.dices = [];
        this.scene = new THREE.Scene();
        this.world = new CANNON.World();
        this.dice = [];
        this.container = container;

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        container.appendChild(this.renderer.domElement);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.25;
        this.renderer.setClearColor(0xffffff, 0); //color, alpha

        this.reinit(container);

        this.world.gravity.set(0, 0, -9.8 * 800);
        this.world.broadphase = new CANNON.NaiveBroadphase();
        this.world.solver.iterations = 16;

        var ambientLight = new THREE.AmbientLight(vars.ambient_light_color, 0.4);
        this.scene.add(ambientLight);

        this.dice_body_material = new CANNON.Material();
        var desk_body_material = new CANNON.Material();
        var barrier_body_material = new CANNON.Material();
        this.world.addContactMaterial(new CANNON.ContactMaterial(
                    desk_body_material, this.dice_body_material, 0.01, 0.5));
        this.world.addContactMaterial(new CANNON.ContactMaterial(
                    barrier_body_material, this.dice_body_material, 0, 1.0));
        this.world.addContactMaterial(new CANNON.ContactMaterial(
                    this.dice_body_material, this.dice_body_material, 0, 0.5));

        this.world.add(new CANNON.RigidBody(0, new CANNON.Plane(), desk_body_material));
        this.barriers = {
            north: new CANNON.RigidBody(0, new CANNON.Plane(), barrier_body_material),
            south: new CANNON.RigidBody(0, new CANNON.Plane(), barrier_body_material),
            east: new CANNON.RigidBody(0, new CANNON.Plane(), barrier_body_material),
            west: new CANNON.RigidBody(0, new CANNON.Plane(), barrier_body_material)
        };
        this.barriers.north.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), Math.PI / 2);
        this.barriers.south.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
        this.barriers.east.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), -Math.PI / 2);
        this.barriers.west.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), Math.PI / 2);
        this.world.add(this.barriers.north);
        this.world.add(this.barriers.south);
        this.world.add(this.barriers.east);
        this.world.add(this.barriers.west);
        this.placeBarriers();

        this.last_time = 0;
        this.running = false;

        this.renderer.render(this.scene, this.camera);
    }

    // called on init and window resize
    that.dice_box.prototype.placeBarriers = function() {
        if (!this.barriers) return;
        var reach = Math.min(vars.scale * 1.7, Math.min(this.w, this.h) * 0.45);
        var x = Math.max(reach + 1, this.w - reach);
        var y = Math.max(reach + 1, this.h - reach);
        this.barriers.north.position.set(0, y, 0);
        this.barriers.south.position.set(0, -y, 0);
        this.barriers.east.position.set(x, 0, 0);
        this.barriers.west.position.set(-x, 0, 0);
    }

    that.dice_box.prototype.reinit = function(container) {
        var width = container.clientWidth;
        var height = container.clientHeight;
        if (window.innerWidth) width = Math.min(width, window.innerWidth);
        if (window.innerHeight) height = Math.min(height, window.innerHeight);
        width = Math.max(1, width);
        height = Math.max(1, height);

        this.cw = width / 2;
        this.ch = height / 2;
        this.w = this.cw;
        this.h = this.ch;
        this.aspect = Math.min(this.cw / this.w, this.ch / this.h);
        var baseScale = Math.sqrt(this.w * this.w + this.h * this.h) / 8 * 0.85;
        var maxScale;
        if (width > 1200) {
          maxScale = Math.min(width / 20, 50);
        } else if (width > 800) {
          maxScale = Math.min(width / 15, 70);
        } else {
          maxScale = baseScale;
        }
        // Keep a die small enough to sit fully inside the screen width.
        var fitScale = width / 8;
        var nextScale = Math.min(baseScale, maxScale, fitScale);
        if (nextScale !== vars.scale) {
          vars.scale = nextScale;
          clearGeometryCache();
        }

        this.renderer.setSize(width, height, false);
        this.placeBarriers();

        this.wh = this.ch / this.aspect / Math.tan(10 * Math.PI / 180);
        if (this.camera) this.scene.remove(this.camera);
        this.camera = new THREE.PerspectiveCamera(20, this.cw / this.ch, 1, this.wh * 1.3);
        this.camera.position.z = this.wh;

        var mw = Math.max(this.w, this.h);
        if (this.light) {
            this.scene.remove(this.light);
            this.scene.remove(this.light.target);
        }
        if (this.fill) this.scene.remove(this.fill);
        this.light = new THREE.SpotLight(vars.spot_light_color, 12);
        this.light.decay = 0; // inverse-square falloff never reaches a table this large
        this.light.penumbra = 0.45;
        this.light.position.set(-mw / 2, mw / 2, mw * 2);
        this.light.target.position.set(0, 0, 0);
        this.light.distance = mw * 5;
        this.light.castShadow = true;
        this.light.shadow.camera.near = mw / 10;
        this.light.shadow.bias = 0.001;
        this.light.shadow.mapSize.set(1024, 1024);
        this.light.shadow.focus = 50 / (this.light.angle * (360 / Math.PI)); // r186 derives shadow fov from the cone; hold it at 50 degrees
        this.scene.add(this.light);
        this.scene.add(this.light.target);

        this.fill = new THREE.DirectionalLight(0xf7f1e4, 2.4);
        this.fill.position.set(mw, -mw * 0.4, mw * 1.5);
        this.scene.add(this.fill);

        if (this.desk) this.scene.remove(this.desk);
        this.desk = new THREE.Mesh(new THREE.PlaneGeometry(this.w * 2, this.h * 2, 1, 1), 
                new THREE.MeshPhongMaterial({ color: vars.desk_color, opacity: vars.desk_opacity, transparent: true }));
        this.desk.receiveShadow = vars.use_shadows;
        this.scene.add(this.desk); 

        this.renderer.render(this.scene, this.camera);
    }

    that.dice_box.prototype.setDice = function(dice) {
        this.dice = dice.slice();
    }

    that.dice_box.prototype.setAppearance = function(appearance) {
        if (appearance.dice === vars.dice_color &&
                appearance.label === vars.label_color &&
                appearance.weight === vars.label_weight &&
                appearance.marble === vars.use_marble) {
            return false;
        }
        vars.dice_color = appearance.dice;
        vars.label_color = appearance.label;
        vars.label_weight = appearance.weight;
        vars.use_marble = appearance.marble;
        clearMaterials();
        this.rolling = false;
        this.clear();
        return true;
    }

    that.dice_box.prototype.start_throw = function(after_roll) {
        if (this.rolling) return;

        var vector = { x: (rnd() * 2 - 1) * this.w, y: -(rnd() * 2 - 1) * this.h };
        var dist = Math.sqrt(vector.x * vector.x + vector.y * vector.y);
        var boost = (rnd() + 3) * dist;
        throw_dices(this, vector, boost, dist, after_roll);
    }

    function notation_for(dice) {
        return {
            set: dice.slice(),
            constant: 0,
            result: [],
            resultTotal: 0,
            resultString: '',
            error: false
        };
    }

    function throw_dices(box, vector, boost, dist, after_roll) {
        var uat = vars.use_adapvite_timestep;

        vector.x /= dist; vector.y /= dist;
        var notation = notation_for(box.dice);
        if (notation.set.length == 0) return;
        var vectors = box.generate_vectors(notation, vector, boost);
        box.rolling = true;
        box.roll(vectors, undefined, function(result) {
            notation.result = result;
            var res = result.join(' ');
            notation.resultTotal = result.reduce(function(s, a) { return s + a; }, 0);
            if (result.length > 1) {
                res += ' = ' + notation.resultTotal;
            }
            notation.resultString = res;

            if (after_roll) after_roll(notation);

            box.rolling = false;
            vars.use_adapvite_timestep = uat;
        });
    }
       
    //todo: the rest of these don't need to be public, but need to read the this properties
    that.dice_box.prototype.generate_vectors = function(notation, vector, boost) {
        var vectors = [];
        for (var i in notation.set) {
            var vec = make_random_vector(vector);
            var pos = {
                x: this.w * (vec.x > 0 ? -1 : 1) * 0.9,
                y: this.h * (vec.y > 0 ? -1 : 1) * 0.9,
                z: rnd() * 200 + 200
            };
            var projector = Math.abs(vec.x / vec.y);
            if (projector > 1.0) pos.y /= projector; else pos.x *= projector;
            var velvec = make_random_vector(vector);
            var velocity = { x: velvec.x * boost, y: velvec.y * boost, z: -10 };
            var inertia = CONSTS.dice_inertia[notation.set[i]];
            var angle = {
                x: -(rnd() * vec.y * 5 + inertia * vec.y),
                y: rnd() * vec.x * 5 + inertia * vec.x,
                z: 0
            };
            var axis = { x: rnd(), y: rnd(), z: rnd(), a: rnd() };
            vectors.push({ set: notation.set[i], pos: pos, velocity: velocity, angle: angle, axis: axis });
        }
        return vectors;
    }

    that.dice_box.prototype.create_dice = function(type, pos, velocity, angle, axis) {
        var dice = threeD_dice['create_' + type]();
        dice.castShadow = true;
        dice.dice_type = type;
        dice.body = new CANNON.RigidBody(CONSTS.dice_mass[type],
                dice.geometry.cannon_shape, this.dice_body_material);
        dice.body.position.set(pos.x, pos.y, pos.z);
        dice.body.quaternion.setFromAxisAngle(new CANNON.Vec3(axis.x, axis.y, axis.z), axis.a * Math.PI * 2);
        dice.body.angularVelocity.set(angle.x, angle.y, angle.z);
        dice.body.velocity.set(velocity.x, velocity.y, velocity.z);
        dice.body.linearDamping = 0.1;
        dice.body.angularDamping = 0.1;
        this.scene.add(dice);
        this.dices.push(dice);
        this.world.add(dice.body);
    }

    that.dice_box.prototype.check_if_throw_finished = function() {
        var res = true;
        var e = 6;
        if (this.iteration < 10 / vars.frame_rate) {
            for (var i = 0; i < this.dices.length; ++i) {
                var dice = this.dices[i];
                if (dice.dice_stopped === true) continue;
                var a = dice.body.angularVelocity, v = dice.body.velocity;
                if (Math.abs(a.x) < e && Math.abs(a.y) < e && Math.abs(a.z) < e &&
                        Math.abs(v.x) < e && Math.abs(v.y) < e && Math.abs(v.z) < e) {
                    if (dice.dice_stopped) {
                        if (this.iteration - dice.dice_stopped > 3) {
                            dice.dice_stopped = true;
                            continue;
                        }
                    }
                    else dice.dice_stopped = this.iteration;
                    res = false;
                }
                else {
                    dice.dice_stopped = undefined;
                    res = false;
                }
            }
        }
        return res;
    }

    that.dice_box.prototype.emulate_throw = function() {
        while (!this.check_if_throw_finished()) {
            ++this.iteration;
            this.world.step(vars.frame_rate);
        }
        return get_dice_values(this.dices);
    }

    that.dice_box.prototype.__animate = function(threadid) {
        var time = (new Date()).getTime();
        var time_diff = (time - this.last_time) / 1000;
        if (time_diff > 3) time_diff = vars.frame_rate;
        ++this.iteration;
        if (vars.use_adapvite_timestep) {
            while (time_diff > vars.frame_rate * 1.1) {
                this.world.step(vars.frame_rate);
                time_diff -= vars.frame_rate;
            }
            this.world.step(time_diff);
        }
        else {
            this.world.step(vars.frame_rate);
        }
        for (var i in this.scene.children) {
            var interact = this.scene.children[i];
            if (interact.body != undefined) {
                interact.position.copy(interact.body.position);
                interact.quaternion.copy(interact.body.quaternion);
                if (interact.face_align) {
                    interact.quaternion.multiply(interact.face_align);
                }
            }
        }
        this.renderer.render(this.scene, this.camera);
        this.last_time = this.last_time ? time : (new Date()).getTime();
        if (this.running == threadid && this.check_if_throw_finished()) {
            this.running = false;
            if (this.callback) this.callback.call(this, get_dice_values(this.dices));
        }
        if (this.running == threadid) {
            (function(t, tid, uat) {
                if (!uat && time_diff < vars.frame_rate) {
                    setTimeout(function() { requestAnimationFrame(function() { t.__animate(tid); }); },
                        (vars.frame_rate - time_diff) * 1000);
                }
                else requestAnimationFrame(function() { t.__animate(tid); });
            })(this, threadid, vars.use_adapvite_timestep);
        }
    }

    that.dice_box.prototype.clear = function() {
        this.running = false;
        var dice;
        while (dice = this.dices.pop()) {
            this.scene.remove(dice); 
            if (dice.body) this.world.remove(dice.body);
        }
        if (this.pane) this.scene.remove(this.pane);
        this.renderer.render(this.scene, this.camera);
        var box = this;
        setTimeout(function() { box.renderer.render(box.scene, box.camera); }, 100);
    }

    that.dice_box.prototype.prepare_dices_for_roll = function(vectors) {
        this.clear();
        this.iteration = 0;
        for (var i in vectors) {
            this.create_dice(vectors[i].set, vectors[i].pos, vectors[i].velocity,
                    vectors[i].angle, vectors[i].axis);
        }
    }

    that.dice_box.prototype.roll = function(vectors, values, callback) {
        this.prepare_dices_for_roll(vectors);
        if (values != undefined && values.length) {
            vars.use_adapvite_timestep = false;
            var res = this.emulate_throw();
            this.prepare_dices_for_roll(vectors);
            for (var i in res)
                align_dice_face(this.dices[i], values[i], res[i]);
        }
        this.callback = callback;
        this.running = (new Date()).getTime();
        this.last_time = 0;
        this.__animate(this.running);
    }

    that.stringify_notation = function(nn) {
        var dict = {}, notation = '';
        for (var i in nn.set) 
            if (!dict[nn.set[i]]) dict[nn.set[i]] = 1; else ++dict[nn.set[i]];
        for (var i in dict) {
            if (notation.length) notation += ' + ';
            notation += (dict[i] > 1 ? dict[i] : '') + i;
        }
        if (nn.constant) {
            if (nn.constant > 0) notation += ' + ' + nn.constant;
            else notation += ' - ' + Math.abs(nn.constant);
        }
        return notation;
    }
    
    // PRIVATE FUNCTIONS

    // dice geometries
    let threeD_dice = {};

    threeD_dice.create_d4 = function() {
        if (!this.d4_geometry) this.d4_geometry = create_d4_geometry(vars.scale * 1.2);
        if (!this.d4_material) this.d4_material = create_d4_materials(vars.scale / 2, vars.scale * 2, CONSTS.d4_labels[0]);
        return new THREE.Mesh(this.d4_geometry, this.d4_material);
    }

    threeD_dice.create_d6 = function() {
        if (!this.d6_geometry) this.d6_geometry = create_d6_geometry(vars.scale * 1.1);
        if (!this.dice_material) this.dice_material = create_dice_materials(CONSTS.standart_d20_dice_face_labels, vars.scale / 2, 0.9);
        return new THREE.Mesh(this.d6_geometry, this.dice_material);
    }

    threeD_dice.create_d8 = function() {
        if (!this.d8_geometry) this.d8_geometry = create_d8_geometry(vars.scale);
        if (!this.dice_material) this.dice_material = create_dice_materials(CONSTS.standart_d20_dice_face_labels, vars.scale / 2, 1.4);
        return new THREE.Mesh(this.d8_geometry, this.dice_material);
    }

    threeD_dice.create_d9 = function() {
        if (!this.d10_geometry) this.d10_geometry = create_d10_geometry(vars.scale * 0.9);
        if (!this.dice_material) this.dice_material = create_dice_materials(CONSTS.standart_d20_dice_face_labels, vars.scale / 2, 1.0);
        return new THREE.Mesh(this.d10_geometry, this.dice_material);
    }

    threeD_dice.create_d10 = function() {
        if (!this.d10_geometry) this.d10_geometry = create_d10_geometry(vars.scale * 0.9);
        if (!this.dice_material) this.dice_material = create_dice_materials(CONSTS.standart_d20_dice_face_labels, vars.scale / 2, 1.0);
        return new THREE.Mesh(this.d10_geometry, this.dice_material);
    }

    threeD_dice.create_d12 = function() {
        if (!this.d12_geometry) this.d12_geometry = create_d12_geometry(vars.scale * 0.9);
        if (!this.dice_material) this.dice_material = create_dice_materials(CONSTS.standart_d20_dice_face_labels, vars.scale / 2, 1.0);
        return new THREE.Mesh(this.d12_geometry, this.dice_material);
    }

    threeD_dice.create_d20 = function() {
        if (!this.d20_geometry) this.d20_geometry = create_d20_geometry(vars.scale);
        if (!this.dice_material) this.dice_material = create_dice_materials(CONSTS.standart_d20_dice_face_labels, vars.scale / 2, 1.2);
        return new THREE.Mesh(this.d20_geometry, this.dice_material);
    }

    threeD_dice.create_d100 = function() {
        if (!this.d10_geometry) this.d10_geometry = create_d10_geometry(vars.scale * 0.9);
        if (!this.d100_material) this.d100_material = create_dice_materials(CONSTS.standart_d100_dice_face_labels, vars.scale / 2, 1.5);
        return new THREE.Mesh(this.d10_geometry, this.d100_material);
    }

    threeD_dice.create_d100s = function() {
        if (!this.d100s_geometry) this.d100s_geometry = create_d100s_geometry(vars.scale * 1.7);
        if (!this.d100s_material) {
            var labels = new Array(102);
            labels[0] = ' ';
            for (var n = 1; n < labels.length; ++n) labels[n] = String(n - 1);
            this.d100s_material = create_dice_materials(labels, vars.scale / 2, 2);
        }
        return new THREE.Mesh(this.d100s_geometry, this.d100s_material);
    }
    
    var SOLID_STONE_GLSL = [
        'float solidHash(vec3 p) {',
        '    p = fract(p * 0.1031);',
        '    p += dot(p, p.zyx + 31.32);',
        '    return fract((p.x + p.y) * p.z);',
        '}',
        'float solidNoise(vec3 p) {',
        '    vec3 i = floor(p);',
        '    vec3 f = fract(p);',
        '    f = f * f * (3.0 - 2.0 * f);',
        '    float n000 = solidHash(i);',
        '    float n100 = solidHash(i + vec3(1.0, 0.0, 0.0));',
        '    float n010 = solidHash(i + vec3(0.0, 1.0, 0.0));',
        '    float n110 = solidHash(i + vec3(1.0, 1.0, 0.0));',
        '    float n001 = solidHash(i + vec3(0.0, 0.0, 1.0));',
        '    float n101 = solidHash(i + vec3(1.0, 0.0, 1.0));',
        '    float n011 = solidHash(i + vec3(0.0, 1.0, 1.0));',
        '    float n111 = solidHash(i + vec3(1.0, 1.0, 1.0));',
        '    return mix(',
        '        mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),',
        '        mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),',
        '        f.z);',
        '}',
        'float solidFbm(vec3 p) {',
        '    float v = 0.0;',
        '    float a = 0.5;',
        '    for (int i = 0; i < 4; i++) {',
        '        v += a * solidNoise(p);',
        '        p = p * 2.03 + vec3(1.7, 9.2, 3.4);',
        '        a *= 0.5;',
        '    }',
        '    return v;',
        '}',
        'vec3 solidStone(vec3 p) {',
        '    vec3 q = p / solidScale + solidSeed;',
        '    float n = solidFbm(q * 3.2);',
        '    float cloud = solidFbm(q * 1.4 + vec3(5.2, 1.3, 2.8));',
        '    float luma = dot(stoneColor, vec3(0.2126, 0.7152, 0.0722));',
        '    float lift = mix(3.6, 1.35, smoothstep(0.02, 0.35, luma));',
        '    vec3 pale = min(stoneColor * lift, vec3(1.0));',
        '    vec3 dark = stoneColor * 0.38;',
        '    vec3 body = mix(dark, pale, cloud);',
        '    float vein = pow(1.0 - abs(sin(dot(q, vec3(7.5, 1.6, 0.9)) + (n - 0.5) * 6.5)), 5.0);',
        '    float shade = pow(1.0 - abs(sin(dot(q, vec3(-1.4, 6.8, 2.1)) + n * 4.0)), 12.0);',
        '    body = mix(body, pale, vein);',
        '    body = mix(body, dark, shade * 0.8);',
        '    return body;',
        '}'
    ].join('\n');

    var SOLID_STONE_MAP = [
        'vec3 stone = solidStone(vSolidPos);',
        'float coverage = texture2D(map, vMapUv).r;',
        'diffuseColor.rgb = mix(stone, solidLabel, coverage) * diffuseColor.rgb;'
    ].join('\n');

    function bind_solid_stone(material, seed) {
        var stone = new THREE.Color(vars.dice_color);
        var ink = new THREE.Color(vars.label_color);
        var scale = vars.scale;
        material.customProgramCacheKey = function () { return 'solid-stone'; };
        material.onBeforeCompile = function (shader) {
            shader.uniforms.stoneColor = { value: stone };
            shader.uniforms.solidLabel = { value: ink };
            shader.uniforms.solidSeed = { value: seed };
            shader.uniforms.solidScale = { value: scale };
            shader.vertexShader = shader.vertexShader
                .replace(
                    '#define PHONG\nvarying vec3 vViewPosition;',
                    '#define PHONG\nvarying vec3 vViewPosition;\nvarying vec3 vSolidPos;'
                )
                .replace(
                    '#include <begin_vertex>',
                    '#include <begin_vertex>\n\tvSolidPos = transformed;'
                );
            shader.fragmentShader = shader.fragmentShader
                .replace(
                    '#define PHONG\nuniform vec3 diffuse;',
                    '#define PHONG\nuniform vec3 diffuse;\nvarying vec3 vSolidPos;\nuniform vec3 stoneColor;\nuniform vec3 solidLabel;\nuniform vec3 solidSeed;\nuniform float solidScale;\n' + SOLID_STONE_GLSL
                )
                .replace('#include <map_fragment>', SOLID_STONE_MAP);
            if (shader.vertexShader.indexOf('vSolidPos = transformed') < 0 ||
                    shader.fragmentShader.indexOf('vec3 solidStone') < 0) {
                throw new Error('Solid stone shader injection failed');
            }
        };
    }

    function paint_face_background(context, width, height, back_color, ink) {
        if (vars.use_marble) {
            context.fillStyle = '#000';
            context.fillRect(0, 0, width, height);
            context.fillStyle = '#fff';
            return;
        }
        context.fillStyle = back_color;
        context.fillRect(0, 0, width, height);
        context.fillStyle = ink;
    }

    function face_texture(canvas) {
        var texture = new THREE.Texture(canvas);
        texture.colorSpace = vars.use_marble ? THREE.LinearSRGBColorSpace : THREE.SRGBColorSpace;
        texture.needsUpdate = true;
        return texture;
    }

    function create_dice_materials(face_labels, size, margin) {
        function create_text_texture(text, color, back_color) {
            if (text == undefined) return null;
            var canvas = document.createElement("canvas");
            var context = canvas.getContext("2d");
            var ts = calc_texture_size(size + size * 2 * margin) * 2;
            canvas.width = canvas.height = ts;
            context.font = vars.label_weight + " " + ts / (1 + 2 * margin) + "pt " + vars.label_font + ", serif";
            paint_face_background(context, canvas.width, canvas.height, back_color, color);
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.fillText(text, canvas.width / 2, canvas.height / 2);
            if (text == '6' || text == '9') {
                context.fillText('  .', canvas.width / 2, canvas.height / 2);
            }
            return face_texture(canvas);
        }
        var materials = [];
        var seed = vars.use_marble ? new THREE.Vector3(rnd() * 80, rnd() * 80, rnd() * 80) : null;
        for (var i = 0; i < face_labels.length; ++i) {
            var material = new THREE.MeshPhongMaterial(copyto(vars.material_options,
                        { map: create_text_texture(face_labels[i], vars.label_color, vars.dice_color) }));
            if (i === 0) material.flatShading = false;
            if (seed) bind_solid_stone(material, seed);
            materials.push(material);
        }
        return materials;
    }

    function create_d4_materials(size, margin, labels) {
        function create_d4_text(text, color, back_color) {
            var canvas = document.createElement("canvas");
            var context = canvas.getContext("2d");
            var ts = calc_texture_size(size + margin) * 2;
            canvas.width = canvas.height = ts;
            context.font = vars.label_weight + " " + (ts - margin) * 0.5 + "pt " + vars.label_font + ", serif";
            paint_face_background(context, canvas.width, canvas.height, back_color, color);
            context.textAlign = "center";
            context.textBaseline = "middle";
            for (var i in text) {
                context.fillText(text[i], canvas.width / 2,
                        canvas.height / 2 - ts * 0.3);
                context.translate(canvas.width / 2, canvas.height / 2);
                context.rotate(Math.PI * 2 / 3);
                context.translate(-canvas.width / 2, -canvas.height / 2);
            }
            return face_texture(canvas);
        }
        var materials = [];
        var seed = vars.use_marble ? new THREE.Vector3(rnd() * 80, rnd() * 80, rnd() * 80) : null;
        for (var i = 0; i < labels.length; ++i) {
            var material = new THREE.MeshPhongMaterial(copyto(vars.material_options,
                        { map: create_d4_text(labels[i], vars.label_color, vars.dice_color) }));
            if (i === 0) material.flatShading = false;
            if (seed) bind_solid_stone(material, seed);
            materials.push(material);
        }
        return materials;
    }

    function create_d4_geometry(radius) {
        var vertices = [[1, 1, 1], [-1, -1, 1], [-1, 1, -1], [1, -1, -1]];
        var faces = [[1, 0, 2, 1], [0, 1, 3, 2], [0, 3, 2, 3], [1, 2, 3, 4]];
        return create_geom(vertices, faces, radius, -0.1, Math.PI * 7 / 6, 0.90);
    }

    function create_d6_geometry(radius) {
        var vertices = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
                [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
        var faces = [[0, 3, 2, 1, 1], [1, 2, 6, 5, 2], [0, 1, 5, 4, 3],
                [3, 7, 6, 2, 4], [0, 4, 7, 3, 5], [4, 5, 6, 7, 6]];
        return create_geom(vertices, faces, radius, 0.1, Math.PI / 4, 0.88);
    }

    function create_d8_geometry(radius) {
        var vertices = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
        var faces = [[0, 2, 4, 1], [0, 4, 3, 2], [0, 3, 5, 3], [0, 5, 2, 4], [1, 3, 4, 5],
                [1, 4, 2, 6], [1, 2, 5, 7], [1, 5, 3, 8]];
        return create_geom(vertices, faces, radius, 0, -Math.PI / 4 / 2, 0.88);
    }

    function create_d10_geometry(radius) {
        var a = Math.PI * 2 / 10, k = Math.cos(a), h = 0.105, v = -1;
        var vertices = [];
        for (var i = 0, b = 0; i < 10; ++i, b += a)
            vertices.push([Math.cos(b), Math.sin(b), h * (i % 2 ? 1 : -1)]);
        vertices.push([0, 0, -1]); vertices.push([0, 0, 1]);
        var faces = [[5, 7, 11, 0], [4, 2, 10, 1], [1, 3, 11, 2], [0, 8, 10, 3], [7, 9, 11, 4],
                [8, 6, 10, 5], [9, 1, 11, 6], [2, 0, 10, 7], [3, 5, 11, 8], [6, 4, 10, 9],
                [1, 0, 2, v], [1, 2, 3, v], [3, 2, 4, v], [3, 4, 5, v], [5, 4, 6, v],
                [5, 6, 7, v], [7, 6, 8, v], [7, 8, 9, v], [9, 8, 0, v], [9, 0, 1, v]];
        return create_geom(vertices, faces, radius, 0, Math.PI * 6 / 5, 0.89);
    }

    function create_d12_geometry(radius) {
        var p = (1 + Math.sqrt(5)) / 2, q = 1 / p;
        var vertices = [[0, q, p], [0, q, -p], [0, -q, p], [0, -q, -p], [p, 0, q],
                [p, 0, -q], [-p, 0, q], [-p, 0, -q], [q, p, 0], [q, -p, 0], [-q, p, 0],
                [-q, -p, 0], [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1], [-1, 1, 1],
                [-1, 1, -1], [-1, -1, 1], [-1, -1, -1]];
        var faces = [[2, 14, 4, 12, 0, 1], [15, 9, 11, 19, 3, 2], [16, 10, 17, 7, 6, 3], [6, 7, 19, 11, 18, 4],
                [6, 18, 2, 0, 16, 5], [18, 11, 9, 14, 2, 6], [1, 17, 10, 8, 13, 7], [1, 13, 5, 15, 3, 8],
                [13, 8, 12, 4, 5, 9], [5, 4, 14, 9, 15, 10], [0, 12, 8, 10, 16, 11], [3, 19, 7, 17, 1, 12]];
        return create_geom(vertices, faces, radius, 0.2, -Math.PI / 4 / 2, 0.88);
    }

    function create_d20_geometry(radius) {
        var t = (1 + Math.sqrt(5)) / 2;
        var vertices = [[-1, t, 0], [1, t, 0 ], [-1, -t, 0], [1, -t, 0],
                [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
                [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
        var faces = [[0, 11, 5, 1], [0, 5, 1, 2], [0, 1, 7, 3], [0, 7, 10, 4], [0, 10, 11, 5],
                [1, 5, 9, 6], [5, 11, 4, 7], [11, 10, 2, 8], [10, 7, 6, 9], [7, 1, 8, 10],
                [3, 9, 4, 11], [3, 4, 2, 12], [3, 2, 6, 13], [3, 6, 8, 14], [3, 8, 9, 15],
                [4, 9, 5, 16], [2, 4, 11, 17], [6, 2, 10, 18], [8, 6, 7, 19], [9, 8, 1, 20]];
        number_d20_canonically(faces, vertices);
        return create_geom(vertices, faces, radius, -0.2, -Math.PI / 4 / 2, 0.88);
    }

    // Chessex-style d20: opposites sum to 21, and 2/8/14 sit on the three
    // faces that share an edge with 20. Even numbers occupy the 20 hemisphere.
    function number_d20_canonically(faces, vertices) {
        var n = faces.length;

        function faceVerts(i) {
            return faces[i].slice(0, 3);
        }

        function oppositeIndex(i) {
            var antipode = [3, 2, 1, 0, 7, 6, 5, 4, 11, 10, 9, 8];
            var vi = faceVerts(i).map(function (v) {
                return antipode[v];
            }).sort(function (a, b) {
                return a - b;
            });
            for (var j = 0; j < n; j++) {
                var vj = faceVerts(j).slice().sort(function (a, b) {
                    return a - b;
                });
                if (vi[0] === vj[0] && vi[1] === vj[1] && vi[2] === vj[2]) return j;
            }
            return -1;
        }

        function edgeNeighbors(i) {
            var vi = faceVerts(i);
            var out = [];
            for (var j = 0; j < n; j++) {
                if (j === i) continue;
                var vj = faceVerts(j);
                var shared = 0;
                for (var k = 0; k < 3; k++) {
                    if (vj.indexOf(vi[k]) >= 0) shared += 1;
                }
                if (shared === 2) out.push(j);
            }
            return out;
        }

        function center(i) {
            var vs = faceVerts(i);
            var x = 0;
            var y = 0;
            var z = 0;
            for (var k = 0; k < 3; k++) {
                x += vertices[vs[k]][0];
                y += vertices[vs[k]][1];
                z += vertices[vs[k]][2];
            }
            return [x, y, z];
        }

        var opp = [];
        for (var i = 0; i < n; i++) {
            opp[i] = oppositeIndex(i);
        }

        var labels = new Array(n);
        var cap = 0;
        labels[cap] = 20;
        labels[opp[cap]] = 1;

        var neigh = edgeNeighbors(cap);
        var around = [2, 8, 14];
        for (var k = 0; k < neigh.length && k < around.length; k++) {
            labels[neigh[k]] = around[k];
            labels[opp[neigh[k]]] = 21 - around[k];
        }

        var capC = center(cap);
        function dotCap(i) {
            var c = center(i);
            return c[0] * capC[0] + c[1] * capC[1] + c[2] * capC[2];
        }

        var remainingEvens = [4, 6, 10, 12, 16, 18];
        var hemisphere = [];
        for (var i = 0; i < n; i++) {
            if (labels[i] != null) continue;
            if (dotCap(i) > 0) hemisphere.push(i);
        }
        hemisphere.sort(function (a, b) {
            return dotCap(b) - dotCap(a);
        });
        for (var h = 0; h < hemisphere.length; h++) {
            var even = remainingEvens[h];
            if (even == null) break;
            labels[hemisphere[h]] = even;
            labels[opp[hemisphere[h]]] = 21 - even;
        }

        for (var i = 0; i < n; i++) {
            if (labels[i] != null) continue;
            for (var v = 20; v >= 1; v--) {
                var taken = false;
                for (var j = 0; j < n; j++) {
                    if (labels[j] === v) {
                        taken = true;
                        break;
                    }
                }
                if (!taken) {
                    labels[i] = v;
                    if (labels[opp[i]] == null) labels[opp[i]] = 21 - v;
                    break;
                }
            }
        }

        for (var i = 0; i < n; i++) {
            faces[i][3] = labels[i];
        }
    }

    function create_d100s_geometry(radius) {
        var sites = fibonacci_sphere(100);
        var triangles = convex_hull(sites);
        var poles = [];
        for (var t = 0; t < triangles.length; ++t) {
            var tri = triangles[t];
            var a = sites[tri[0]], b = sites[tri[1]], c = sites[tri[2]];
            var normal = b.clone().sub(a).cross(c.clone().sub(a));
            poles.push(normal.multiplyScalar(1 / normal.dot(a)));
        }
        var incident = new Array(sites.length);
        for (var i = 0; i < sites.length; ++i) incident[i] = [];
        for (var t = 0; t < triangles.length; ++t) {
            for (var k = 0; k < 3; ++k) incident[triangles[t][k]].push(t);
        }
        var labels = label_antipodes(sites);
        var maxLen = 0;
        for (var i = 0; i < poles.length; ++i) maxLen = Math.max(maxLen, poles[i].length());
        var vertices = new Array(poles.length);
        for (var i = 0; i < poles.length; ++i) {
            var p = poles[i].multiplyScalar(1 / maxLen);
            vertices[i] = [p.x, p.y, p.z];
        }
        var faces = new Array(sites.length);
        for (var i = 0; i < sites.length; ++i) {
            var loop = order_around(sites[i], incident[i], poles);
            loop.push(labels[i]);
            faces[i] = loop;
        }
        return create_geom(vertices, faces, radius, 0.25, 0, 0.97, true);
    }

    function fibonacci_sphere(count) {
        var points = new Array(count);
        var golden = Math.PI * (3 - Math.sqrt(5));
        for (var i = 0; i < count; ++i) {
            var y = 1 - (i / (count - 1)) * 2;
            var ring = Math.sqrt(Math.max(0, 1 - y * y));
            var theta = golden * i;
            points[i] = new THREE.Vector3(Math.cos(theta) * ring, y, Math.sin(theta) * ring);
        }
        return points;
    }

    function hull_orient(a, b, c, p) {
        return b.clone().sub(a).cross(c.clone().sub(a)).dot(p.clone().sub(a));
    }

    function convex_hull(points) {
        var interior = points[0].clone().add(points[1]).add(points[2]).add(points[3]).multiplyScalar(0.25);
        function newFace(a, b, c) {
            if (hull_orient(points[a], points[b], points[c], interior) > 0) {
                var swap = b;
                b = c;
                c = swap;
            }
            return [a, b, c];
        }
        function sees(face, index) {
            return hull_orient(points[face[0]], points[face[1]], points[face[2]], points[index]) > 1e-8;
        }
        var faces = [newFace(0, 1, 2), newFace(0, 2, 3), newFace(0, 3, 1), newFace(1, 3, 2)];
        for (var index = 4; index < points.length; ++index) {
            var visible = [];
            for (var f = 0; f < faces.length; ++f) {
                if (sees(faces[f], index)) visible.push(f);
            }
            if (!visible.length) continue;
            var edgeCount = {};
            for (var v = 0; v < visible.length; ++v) {
                var verts = faces[visible[v]];
                for (var e = 0; e < 3; ++e) {
                    var from = verts[e], to = verts[(e + 1) % 3];
                    var key = from < to ? from + ',' + to : to + ',' + from;
                    if (!edgeCount[key]) edgeCount[key] = { dir: [from, to], n: 0 };
                    edgeCount[key].n += 1;
                }
            }
            var remove = {};
            for (var v = 0; v < visible.length; ++v) remove[visible[v]] = true;
            var next = [];
            for (var f = 0; f < faces.length; ++f) {
                if (!remove[f]) next.push(faces[f]);
            }
            for (var key in edgeCount) {
                if (edgeCount[key].n === 1) {
                    next.push(newFace(edgeCount[key].dir[0], edgeCount[key].dir[1], index));
                }
            }
            faces = next;
        }
        return faces;
    }

    function label_antipodes(sites) {
        var used = new Array(sites.length);
        var partner = new Array(sites.length);
        for (var i = 0; i < sites.length; ++i) {
            if (used[i]) continue;
            var best = -1, bestDot = 2;
            for (var j = i + 1; j < sites.length; ++j) {
                if (used[j]) continue;
                var closeness = sites[i].dot(sites[j]);
                if (closeness < bestDot) {
                    bestDot = closeness;
                    best = j;
                }
            }
            used[i] = used[best] = true;
            partner[i] = best;
            partner[best] = i;
        }
        var labels = new Array(sites.length);
        var number = 1;
        for (var i = 0; i < sites.length; ++i) {
            if (labels[i]) continue;
            labels[i] = number;
            labels[partner[i]] = 101 - number;
            number += 1;
        }
        return labels;
    }

    function order_around(center, triangleIds, poles) {
        var axis = center.clone().normalize();
        var helper = Math.abs(axis.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
        var tangent = helper.clone().cross(axis).normalize();
        var bitangent = axis.clone().cross(tangent);
        var ordered = triangleIds.slice();
        ordered.sort(function(p, q) {
            var ap = Math.atan2(poles[p].dot(bitangent), poles[p].dot(tangent));
            var aq = Math.atan2(poles[q].dot(bitangent), poles[q].dot(tangent));
            return ap - aq;
        });
        return ordered;
    }

    // HELPERS

    function rnd() {
        return Math.random();
    }

    function create_shape(vertices, faces, radius) {
        var cv = new Array(vertices.length), cf = new Array(faces.length);
        for (var i = 0; i < vertices.length; ++i) {
            var v = vertices[i];
            cv[i] = new CANNON.Vec3(v.x * radius, v.y * radius, v.z * radius);
        }
        for (var i = 0; i < faces.length; ++i) {
            cf[i] = faces[i].slice(0, faces[i].length - 1);
        }
        return new CANNON.ConvexPolyhedron(cv, cf);
    }

    function face_uv(angle, tab) {
        return [(Math.cos(angle) + 1 + tab) / 2 / (1 + tab),
                (Math.sin(angle) + 1 + tab) / 2 / (1 + tab)];
    }

    function make_geom(vertices, faces, radius, tab, af, built) {
        var positions = [];
        var normals = [];
        var uvs = [];
        var faceRecords = [];
        var geom = new THREE.BufferGeometry();
        for (var i = 0; i < vertices.length; ++i) {
            vertices[i].multiplyScalar(radius);
        }
        function pushNormal(vertex, faceNormal) {
            var n = vertex.userNormal || faceNormal;
            normals.push(n.x, n.y, n.z);
        }
        function planarFaceUvs(ii, fl) {
            var center = new THREE.Vector3();
            var k;
            for (k = 0; k < fl; ++k) center.add(vertices[ii[k]]);
            center.multiplyScalar(1 / fl);
            var nrm = new THREE.Vector3();
            for (k = 0; k < fl; ++k) {
                var p = vertices[ii[k]];
                var q = vertices[ii[(k + 1) % fl]];
                nrm.x += (p.y - q.y) * (p.z + q.z);
                nrm.y += (p.z - q.z) * (p.x + q.x);
                nrm.z += (p.x - q.x) * (p.y + q.y);
            }
            if (nrm.lengthSq() < 1e-12) nrm.set(0, 0, 1);
            else nrm.normalize();
            var preferred = Math.abs(nrm.y) > 0.85 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
            var bitangent = preferred.clone().addScaledVector(nrm, -preferred.dot(nrm)).normalize();
            var tangent = bitangent.clone().cross(nrm).normalize();
            var coords = [];
            var maxR = 1e-6;
            for (k = 0; k < fl; ++k) {
                var rel = vertices[ii[k]].clone().sub(center);
                var x = rel.dot(tangent);
                var y = rel.dot(bitangent);
                coords.push(x, y);
                var reach = Math.sqrt(x * x + y * y);
                if (reach > maxR) maxR = reach;
            }
            var fit = 0.42 / maxR;
            var mapped = new Array(fl);
            for (k = 0; k < fl; ++k) {
                mapped[k] = [0.5 + coords[k * 2] * fit, 0.5 + coords[k * 2 + 1] * fit];
            }
            return mapped;
        }
        var vertexCount = 0;
        for (var i = 0; i < faces.length; ++i) {
            var ii = faces[i], fl = ii.length - 1;
            var aa = Math.PI * 2 / fl;
            var materialIndex = ii[fl] + 1;
            var start = vertexCount;
            var faceUvs = built && ii[fl] >= 0 ? planarFaceUvs(ii, fl) : null;
            for (var j = 0; j < fl - 2; ++j) {
                var a = vertices[ii[0]];
                var b = vertices[ii[j + 1]];
                var c = vertices[ii[j + 2]];
                var faceNormal = new THREE.Vector3().subVectors(c, b).cross(
                    new THREE.Vector3().subVectors(a, b)
                );
                if (faceNormal.lengthSq() < 1e-12) faceNormal.set(0, 0, 1);
                else faceNormal.normalize();
                positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
                pushNormal(a, faceNormal);
                pushNormal(b, faceNormal);
                pushNormal(c, faceNormal);
                var uvA = faceUvs ? faceUvs[0] : face_uv(af, tab);
                var uvB = faceUvs ? faceUvs[j + 1] : face_uv(aa * (j + 1) + af, tab);
                var uvC = faceUvs ? faceUvs[j + 2] : face_uv(aa * (j + 2) + af, tab);
                uvs.push(uvA[0], uvA[1], uvB[0], uvB[1], uvC[0], uvC[1]);
                faceRecords.push({ materialIndex: materialIndex, normal: faceNormal });
                vertexCount += 3;
            }
            if (vertexCount > start) geom.addGroup(start, vertexCount - start, materialIndex);
        }
        geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius);
        geom.faces = faceRecords;
        return geom;
    }

    function chamfer_geom(vectors, faces, chamfer) {
        var chamfer_vectors = [], chamfer_faces = [], corner_faces = new Array(vectors.length);
        var sources = [], originals = [];
        for (var i = 0; i < vectors.length; ++i) corner_faces[i] = [];
        for (var i = 0; i < faces.length; ++i) {
            var ii = faces[i], fl = ii.length - 1;
            var center_point = new THREE.Vector3();
            var face = new Array(fl);
            for (var j = 0; j < fl; ++j) {
                var original = vectors[ii[j]].clone();
                var vv = original.clone();
                center_point.add(original);
                sources.push(ii[j]);
                originals.push(original);
                corner_faces[ii[j]].push(face[j] = chamfer_vectors.push(vv) - 1);
            }
            center_point.divideScalar(fl);
            for (var j = 0; j < fl; ++j) {
                var vv = chamfer_vectors[face[j]];
                vv.subVectors(vv, center_point).multiplyScalar(chamfer).addVectors(vv, center_point);
            }
            face.push(ii[fl]);
            chamfer_faces.push(face);
        }
        var edgeStart = chamfer_faces.length;
        for (var i = 0; i < faces.length - 1; ++i) {
            for (var j = i + 1; j < faces.length; ++j) {
                var pairs = [], lastm = -1;
                for (var m = 0; m < faces[i].length - 1; ++m) {
                    var n = faces[j].indexOf(faces[i][m]);
                    if (n >= 0 && n < faces[j].length - 1) {
                        if (lastm >= 0 && m != lastm + 1) pairs.unshift([i, m], [j, n]);
                        else pairs.push([i, m], [j, n]);
                        lastm = m;
                    }
                }
                if (pairs.length != 4) continue;
                chamfer_faces.push([chamfer_faces[pairs[0][0]][pairs[0][1]],
                        chamfer_faces[pairs[1][0]][pairs[1][1]],
                        chamfer_faces[pairs[3][0]][pairs[3][1]],
                        chamfer_faces[pairs[2][0]][pairs[2][1]], -1]);
            }
        }
        var cornerStart = chamfer_faces.length;
        for (var i = 0; i < corner_faces.length; ++i) {
            var cf = corner_faces[i], face = [cf[0]], count = cf.length - 1;
            while (count) {
                for (var m = faces.length; m < chamfer_faces.length; ++m) {
                    var index = chamfer_faces[m].indexOf(face[face.length - 1]);
                    if (index >= 0 && index < 4) {
                        if (--index == -1) index = 3;
                        var next_vertex = chamfer_faces[m][index];
                        if (cf.indexOf(next_vertex) >= 0) {
                            face.push(next_vertex);
                            break;
                        }
                    }
                }
                --count;
            }
            face.push(-1);
            chamfer_faces.push(face);
        }
        return {
            vectors: chamfer_vectors,
            faces: chamfer_faces,
            sources: sources,
            originals: originals,
            edgeStart: edgeStart,
            cornerStart: cornerStart
        };
    }

    function fillet_chamfer(cg, steps) {
        var outV = [];
        var outF = [];
        var endpoint = {};
        var vertNormal = new Array(cg.vectors.length);

        function addVertex(position, normal) {
            var v = position.clone();
            v.userNormal = normal ? normal.clone() : null;
            outV.push(v);
            return outV.length - 1;
        }

        function faceNormal(face) {
            var a = cg.vectors[face[0]];
            var b = cg.vectors[face[1]];
            var c = cg.vectors[face[2]];
            var n = new THREE.Vector3().subVectors(c, b).cross(new THREE.Vector3().subVectors(a, b));
            if (n.lengthSq() < 1e-12) return new THREE.Vector3(0, 1, 0);
            return n.normalize();
        }

        function blendNormal(n0, n1, t) {
            var n = new THREE.Vector3().lerpVectors(n0, n1, t);
            if (n.lengthSq() < 1e-12) return n0.clone();
            return n.normalize();
        }

        function bezier(a, control, b, t) {
            var u = 1 - t;
            return new THREE.Vector3()
                .addScaledVector(a, u * u)
                .addScaledVector(control, 2 * u * t)
                .addScaledVector(b, t * t);
        }

        for (var i = 0; i < cg.edgeStart; i++) {
            var face = cg.faces[i];
            var n = faceNormal(face);
            var nf = [];
            for (var j = 0; j < face.length - 1; j++) {
                vertNormal[face[j]] = n;
                nf.push(addVertex(cg.vectors[face[j]], null));
            }
            nf.push(face[face.length - 1]);
            outF.push(nf);
        }

        function endPoint(index) {
            if (endpoint[index] == null) {
                endpoint[index] = addVertex(cg.vectors[index], vertNormal[index]);
            }
            return endpoint[index];
        }

        var rails = {};
        function railKey(a, b) {
            return a < b ? a + ',' + b : b + ',' + a;
        }

        function buildRail(ia, ib) {
            var ids = [];
            var control = cg.originals[ia];
            var n0 = vertNormal[ia];
            var n1 = vertNormal[ib];
            for (var s = 0; s <= steps; s++) {
                var t = s / steps;
                if (s === 0) ids.push(endPoint(ia));
                else if (s === steps) ids.push(endPoint(ib));
                else ids.push(addVertex(
                    bezier(cg.vectors[ia], control, cg.vectors[ib], t),
                    blendNormal(n0, n1, t)
                ));
            }
            rails[railKey(ia, ib)] = { a: ia, b: ib, ids: ids };
            return ids;
        }

        for (var e = cg.edgeStart; e < cg.cornerStart; e++) {
            var edge = cg.faces[e];
            if (edge.length < 5) continue;
            if (!vertNormal[edge[0]] || !vertNormal[edge[1]]) continue;
            var row0 = buildRail(edge[0], edge[1]);
            var row1 = buildRail(edge[3], edge[2]);
            for (var s = 0; s < steps; s++) {
                outF.push([row0[s], row0[s + 1], row1[s + 1], row1[s], -1]);
            }
        }

        for (var c = cg.cornerStart; c < cg.faces.length; c++) {
            var corner = cg.faces[c];
            var count = corner.length - 1;
            if (count < 3 || corner[0] == null) continue;
            var loop = [];
            for (var k = 0; k < count; k++) {
                var ia = corner[k];
                var ib = corner[(k + 1) % count];
                if (ia == null || ib == null) continue;
                var rail = rails[railKey(ia, ib)];
                var ids;
                if (!rail) {
                    ids = [endPoint(ia), endPoint(ib)];
                } else if (rail.a === ia) {
                    ids = rail.ids;
                } else {
                    ids = rail.ids.slice().reverse();
                }
                for (var s = 0; s < ids.length - 1; s++) loop.push(ids[s]);
            }
            if (loop.length < 3) continue;
            var sharp = cg.originals[corner[0]];
            var avg = new THREE.Vector3();
            var cn = new THREE.Vector3();
            for (var k = 0; k < loop.length; k++) {
                avg.add(outV[loop[k]]);
                if (outV[loop[k]].userNormal) cn.add(outV[loop[k]].userNormal);
            }
            avg.multiplyScalar(1 / loop.length);
            if (cn.lengthSq() < 1e-12) cn.copy(sharp);
            var center = avg.clone().lerp(sharp, 0.42);
            var cIdx = addVertex(center, cn.normalize());
            for (var k = 0; k < loop.length; k++) {
                outF.push([loop[k], loop[(k + 1) % loop.length], cIdx, -1]);
            }
        }

        return { vectors: outV, faces: outF };
    }

    function create_geom(vertices, faces, radius, tab, af, chamfer, built) {
        var vectors = new Array(vertices.length);
        for (var i = 0; i < vertices.length; ++i) {
            vectors[i] = (new THREE.Vector3).fromArray(vertices[i]);
            if (!built) vectors[i].normalize();
        }
        var cg = chamfer_geom(vectors, faces, chamfer);
        var rounded = fillet_chamfer(cg, 4);
        var geom = make_geom(rounded.vectors, rounded.faces, radius, tab, af, built);
        //var geom = make_geom(vectors, faces, radius, tab, af); // Without chamfer
        geom.cannon_shape = create_shape(vectors, faces, radius);
        return geom;
    }

    function calc_texture_size(approx) {
        return Math.pow(2, Math.floor(Math.log(approx) / Math.log(2)));
    }

    function make_random_vector(vector) {
        var random_angle = rnd() * Math.PI / 5 - Math.PI / 5 / 2;
        var vec = {
            x: vector.x * Math.cos(random_angle) - vector.y * Math.sin(random_angle),
            y: vector.x * Math.sin(random_angle) + vector.y * Math.cos(random_angle)
        };
        if (vec.x == 0) vec.x = 0.01;
        if (vec.y == 0) vec.y = 0.01;
        return vec;
    }

    //determines which face is up after roll animation
    function get_dice_value(dice) {
        var vector = new THREE.Vector3(0, 0, dice.dice_type == 'd4' ? -1 : 1);
        var orient = new THREE.Quaternion().copy(dice.body.quaternion);
        if (dice.face_align) {
            orient.multiply(dice.face_align);
        }
        var closest_face, closest_angle = Math.PI * 2;
        for (var i = 0, l = dice.geometry.faces.length; i < l; ++i) {
            var face = dice.geometry.faces[i];
            if (face.materialIndex == 0) continue;
            var angle = face.normal.clone().applyQuaternion(orient).angleTo(vector);
            if (angle < closest_angle) {
                closest_angle = angle;
                closest_face = face;
            }
        }
        if (!closest_face) {
            throw new Error('Could not read a face on ' + dice.dice_type);
        }
        var matindex = closest_face.materialIndex - 1;
        if (dice.dice_type == 'd100') matindex *= 10;
        if (dice.dice_type == 'd10' && matindex == 0) matindex = 10;
        return matindex;
    }

    function get_dice_values(dices) {
        var values = [];
        for (var i = 0, l = dices.length; i < l; ++i) {
            values.push(get_dice_value(dices[i]));
        }
        return values;
    }

    function numbered_face_normals(geom) {
        var byMat = {};
        for (var i = 0, l = geom.faces.length; i < l; ++i) {
            var face = geom.faces[i];
            if (face.materialIndex == 0) continue;
            if (!byMat[face.materialIndex]) {
                byMat[face.materialIndex] = face.normal.clone();
            }
        }
        return byMat;
    }

    function align_dice_face(dice, value, res) {
        if (dice.dice_type == 'd10' && value == 10) value = 0;
        if (value === res) return;
        var normals = numbered_face_normals(dice.geometry);
        var nRes = normals[res + 1];
        var nVal = normals[value + 1];
        if (!nRes || !nVal) {
            throw new Error(
                'Cannot align ' + dice.dice_type + ' face ' + value +
                ' onto physics result ' + res
            );
        }
        dice.face_align = new THREE.Quaternion().setFromUnitVectors(
            nVal.clone().normalize(),
            nRes.clone().normalize()
        );
    }
    
    function clearMaterials() {
        threeD_dice.dice_material = null;
        threeD_dice.d4_material = null;
        threeD_dice.d100_material = null;
        threeD_dice.d100s_material = null;
    }

    function clearGeometryCache() {
        threeD_dice.d4_geometry = null;
        threeD_dice.d6_geometry = null;
        threeD_dice.d8_geometry = null;
        threeD_dice.d10_geometry = null;
        threeD_dice.d12_geometry = null;
        threeD_dice.d20_geometry = null;
        threeD_dice.d100s_geometry = null;
        clearMaterials();
    }

    return that;
}());

if (typeof window !== 'undefined') { window.DICE = DICE; }
