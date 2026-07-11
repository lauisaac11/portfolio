(() => {
    "use strict";

    const KEY_SEQUENCE = Object.freeze([
        "ArrowUp",
        "ArrowUp",
        "ArrowDown",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "ArrowLeft",
        "ArrowRight",
        "KeyB",
        "KeyA"
    ]);

    const SCRIPT_URL = document.currentScript?.src || document.baseURI;

    // Replace this file only when a different rocket asset is supplied.
    const ROCKET_IMAGE_SRC = new URL("../img/px_rocket.png", SCRIPT_URL).href;

    const CONFIG = Object.freeze({
        overlayOpacity: 0.72,
        fadeInDuration: 320,
        rocketRevealDelay: 140,
        chargeDuration: 1300,
        launchDuration: 2400,
        fireworksTailDuration: 1400,
        fadeOutDuration: 460,
        fireworkCount: 8,
        desktopParticleMultiplier: 1,
        mobileParticleMultiplier: 0.55,
        reducedMotionMultiplier: 0.34,
        maxDevicePixelRatio: 2,
        imageLoadTimeout: 5000
    });

    const FIREWORK_COLORS = Object.freeze([
        "#ffd166",
        "#ff70a6",
        "#70a1ff",
        "#b388ff",
        "#5ffbf1",
        "#ff9f43"
    ]);

    const ION_COLORS = Object.freeze([
        "#f4ffff",
        "#9afcff",
        "#55c8ff",
        "#7a8cff",
        "#b388ff"
    ]);

    const clamp = (value, minimum = 0, maximum = 1) =>
        Math.min(maximum, Math.max(minimum, value));

    const randomBetween = (minimum, maximum) =>
        minimum + Math.random() * (maximum - minimum);

    const easeOutCubic = (value) => 1 - Math.pow(1 - value, 3);
    const easeInCubic = (value) => value * value * value;

    function buildPrefixTable(sequence) {
        const table = new Array(sequence.length).fill(0);
        let prefixLength = 0;

        for (let index = 1; index < sequence.length; index += 1) {
            while (
                prefixLength > 0 &&
                sequence[index] !== sequence[prefixLength]
            ) {
                prefixLength = table[prefixLength - 1];
            }

            if (sequence[index] === sequence[prefixLength]) {
                prefixLength += 1;
                table[index] = prefixLength;
            }
        }

        return table;
    }

    function createSequenceMatcher(sequence, onMatch) {
        const prefixTable = buildPrefixTable(sequence);
        let matchedLength = 0;

        return {
            push(code) {
                while (
                    matchedLength > 0 &&
                    code !== sequence[matchedLength]
                ) {
                    matchedLength = prefixTable[matchedLength - 1];
                }

                if (code === sequence[matchedLength]) {
                    matchedLength += 1;
                }

                if (matchedLength === sequence.length) {
                    matchedLength = prefixTable[matchedLength - 1];
                    onMatch();
                    return true;
                }

                return false;
            },

            reset() {
                matchedLength = 0;
            }
        };
    }

    function loadRocketImage(source, timeoutDuration) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            let settled = false;
            let timeoutId = 0;

            const finish = (error) => {
                if (settled) {
                    return;
                }

                settled = true;
                window.clearTimeout(timeoutId);
                image.onload = null;
                image.onerror = null;

                if (error) {
                    reject(error);
                } else {
                    resolve(image);
                }
            };

            image.alt = "";
            image.decoding = "async";
            image.draggable = false;
            image.onload = () => finish(null);
            image.onerror = () => finish(new Error("Rocket image failed to load."));
            timeoutId = window.setTimeout(
                () => finish(new Error("Rocket image load timed out.")),
                timeoutDuration
            );
            image.src = source;

            if (image.complete) {
                queueMicrotask(() => {
                    finish(
                        image.naturalWidth > 0
                            ? null
                            : new Error("Rocket image is unavailable.")
                    );
                });
            }
        });
    }

    function createScene(rocketImage) {
        const overlay = document.createElement("div");
        overlay.className = "konami-rocket-overlay";
        overlay.setAttribute("aria-hidden", "true");
        overlay.dataset.konamiRocketState = "charge";
        overlay.style.setProperty(
            "--konami-rocket-overlay-opacity",
            String(CONFIG.overlayOpacity)
        );

        const canvas = document.createElement("canvas");
        canvas.className = "konami-rocket-canvas";

        const vehicle = document.createElement("div");
        vehicle.className = "konami-rocket-vehicle";

        const glow = document.createElement("div");
        glow.className = "konami-rocket-glow";

        const ionFlame = document.createElement("div");
        ionFlame.className = "konami-rocket-ion-flame";

        rocketImage.className = "konami-rocket-image";
        rocketImage.setAttribute("aria-hidden", "true");

        vehicle.append(glow, ionFlame, rocketImage);
        overlay.append(canvas, vehicle);

        return {
            overlay,
            canvas,
            vehicle,
            image: rocketImage
        };
    }

    function createParticleEngine(canvas, reducedMotion) {
        const context = canvas.getContext("2d", {
            alpha: true,
            desynchronized: true
        });

        if (!context) {
            throw new Error("Canvas is unavailable.");
        }

        const particles = [];
        let width = 1;
        let height = 1;
        let devicePixelRatio = 1;
        let ionRemainder = 0;
        let energyRemainder = 0;

        function densityMultiplier() {
            const responsiveMultiplier =
                width <= 720
                    ? CONFIG.mobileParticleMultiplier
                    : CONFIG.desktopParticleMultiplier;

            return (
                responsiveMultiplier *
                (reducedMotion ? CONFIG.reducedMotionMultiplier : 1)
            );
        }

        function maximumParticleCount() {
            return Math.round(160 + 620 * densityMultiplier());
        }

        function resize() {
            width = Math.max(1, window.innerWidth);
            height = Math.max(1, window.innerHeight);
            devicePixelRatio = Math.min(
                window.devicePixelRatio || 1,
                CONFIG.maxDevicePixelRatio
            );

            canvas.width = Math.round(width * devicePixelRatio);
            canvas.height = Math.round(height * devicePixelRatio);
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;
            context.setTransform(
                devicePixelRatio,
                0,
                0,
                devicePixelRatio,
                0,
                0
            );
        }

        function canAddParticle() {
            return particles.length < maximumParticleCount();
        }

        function spawnIon(nozzleX, nozzleY, strength, deltaSeconds) {
            const density = densityMultiplier();
            ionRemainder += (62 + 108 * strength) * density * deltaSeconds;
            const count = Math.min(Math.floor(ionRemainder), 8);
            ionRemainder -= count;

            for (let index = 0; index < count && canAddParticle(); index += 1) {
                const life = randomBetween(0.3, 0.68);

                particles.push({
                    type: "ion",
                    x: nozzleX + randomBetween(-8, 8) * (0.7 + strength * 0.2),
                    y: nozzleY + randomBetween(-2, 9),
                    velocityX: randomBetween(-38, 38),
                    velocityY:
                        randomBetween(250, 470) * (0.82 + strength * 0.38),
                    age: 0,
                    life,
                    size: randomBetween(1.4, 3.8) * (0.8 + strength * 0.2),
                    color: ION_COLORS[
                        Math.floor(Math.random() * ION_COLORS.length)
                    ]
                });
            }
        }

        function spawnEnergy(centerX, centerY, radius, strength, deltaSeconds) {
            energyRemainder +=
                (4 + 10 * strength) * densityMultiplier() * deltaSeconds;
            const count = Math.min(Math.floor(energyRemainder), 2);
            energyRemainder -= count;

            for (let index = 0; index < count && canAddParticle(); index += 1) {
                const angle = randomBetween(0, Math.PI * 2);
                const speed = randomBetween(18, 48) * (0.5 + strength * 0.5);
                const distance = randomBetween(radius * 0.45, radius);

                particles.push({
                    type: "energy",
                    x: centerX + Math.cos(angle) * distance,
                    y: centerY + Math.sin(angle) * distance,
                    velocityX: Math.cos(angle) * speed,
                    velocityY: Math.sin(angle) * speed,
                    age: 0,
                    life: randomBetween(0.42, 0.82),
                    size: randomBetween(1.2, 2.8),
                    color: Math.random() > 0.3 ? "#72e8ff" : "#b388ff"
                });
            }
        }

        function burst(originX, originY, color, scale) {
            const density = densityMultiplier();
            const sparkCount = Math.max(10, Math.round(randomBetween(30, 44) * density));
            const phaseOffset = randomBetween(0, Math.PI * 2);

            if (canAddParticle()) {
                particles.push({
                    type: "flash",
                    x: originX,
                    y: originY,
                    age: 0,
                    life: 0.2,
                    size: 34 * scale,
                    color
                });
            }

            for (
                let index = 0;
                index < sparkCount && canAddParticle();
                index += 1
            ) {
                const angle =
                    phaseOffset +
                    (index / sparkCount) * Math.PI * 2 +
                    randomBetween(-0.055, 0.055);
                const speed = randomBetween(90, 235) * scale;

                particles.push({
                    type: "firework",
                    x: originX,
                    y: originY,
                    velocityX: Math.cos(angle) * speed,
                    velocityY: Math.sin(angle) * speed,
                    age: 0,
                    life: randomBetween(0.9, 1.52),
                    size: randomBetween(1.35, 3.35) * scale,
                    color
                });
            }
        }

        function update(deltaSeconds) {
            for (let index = particles.length - 1; index >= 0; index -= 1) {
                const particle = particles[index];
                particle.age += deltaSeconds;

                if (particle.age >= particle.life) {
                    particles[index] = particles[particles.length - 1];
                    particles.pop();
                    continue;
                }

                if (particle.type === "flash") {
                    continue;
                }

                if (particle.type === "firework") {
                    const drag = Math.pow(0.982, deltaSeconds * 60);
                    particle.velocityX *= drag;
                    particle.velocityY = particle.velocityY * drag + 78 * deltaSeconds;
                } else if (particle.type === "energy") {
                    const drag = Math.pow(0.97, deltaSeconds * 60);
                    particle.velocityX *= drag;
                    particle.velocityY *= drag;
                } else {
                    particle.velocityX *= Math.pow(0.985, deltaSeconds * 60);
                    particle.velocityY += 36 * deltaSeconds;
                }

                particle.x += particle.velocityX * deltaSeconds;
                particle.y += particle.velocityY * deltaSeconds;
            }
        }

        function draw() {
            context.setTransform(1, 0, 0, 1, 0, 0);
            context.clearRect(0, 0, canvas.width, canvas.height);
            context.setTransform(
                devicePixelRatio,
                0,
                0,
                devicePixelRatio,
                0,
                0
            );
            context.globalCompositeOperation = "lighter";

            for (const particle of particles) {
                const remaining = clamp(1 - particle.age / particle.life);

                if (particle.type === "flash") {
                    const radius = particle.size * (0.65 + remaining * 0.75);
                    const gradient = context.createRadialGradient(
                        particle.x,
                        particle.y,
                        0,
                        particle.x,
                        particle.y,
                        radius
                    );
                    gradient.addColorStop(0, "rgba(255,255,255,0.95)");
                    gradient.addColorStop(0.18, particle.color);
                    gradient.addColorStop(1, "rgba(0,0,0,0)");
                    context.globalAlpha = remaining;
                    context.fillStyle = gradient;
                    context.beginPath();
                    context.arc(particle.x, particle.y, radius, 0, Math.PI * 2);
                    context.fill();
                    continue;
                }

                context.fillStyle = particle.color;
                context.strokeStyle = particle.color;
                context.shadowColor = particle.color;

                if (particle.type === "firework") {
                    context.globalAlpha = Math.pow(remaining, 1.4);
                    context.shadowBlur = 9 * remaining;
                    context.lineWidth = Math.max(0.6, particle.size * remaining);
                    context.beginPath();
                    context.moveTo(particle.x, particle.y);
                    context.lineTo(
                        particle.x - particle.velocityX * 0.026,
                        particle.y - particle.velocityY * 0.026
                    );
                    context.stroke();
                } else if (particle.type === "ion") {
                    context.globalAlpha = Math.pow(remaining, 1.7);
                    context.shadowBlur = 12 * remaining;
                    context.beginPath();
                    context.ellipse(
                        particle.x,
                        particle.y,
                        particle.size * 0.72,
                        particle.size * (2.1 + remaining),
                        0,
                        0,
                        Math.PI * 2
                    );
                    context.fill();
                } else {
                    context.globalAlpha = Math.pow(remaining, 1.5) * 0.8;
                    context.shadowBlur = 8 * remaining;
                    context.beginPath();
                    context.arc(
                        particle.x,
                        particle.y,
                        particle.size * (0.35 + remaining * 0.65),
                        0,
                        Math.PI * 2
                    );
                    context.fill();
                }
            }

            context.globalAlpha = 1;
            context.shadowBlur = 0;
            context.globalCompositeOperation = "source-over";
        }

        function clear() {
            particles.length = 0;
            context.setTransform(1, 0, 0, 1, 0, 0);
            context.clearRect(0, 0, canvas.width, canvas.height);
        }

        resize();

        return {
            resize,
            spawnIon,
            spawnEnergy,
            burst,
            update,
            draw,
            clear
        };
    }

    function createFireworkSchedule(count, launchDuration) {
        const firstBurst = 120;
        const lastBurst = Math.min(launchDuration - 160, 2140);
        const schedule = [];

        for (let index = 0; index < count; index += 1) {
            const ratio = count === 1 ? 0 : index / (count - 1);
            const baseTime = firstBurst + (lastBurst - firstBurst) * ratio;
            schedule.push(baseTime + randomBetween(-65, 65));
        }

        return schedule.sort((first, second) => first - second);
    }

    function createFireworkOrigin(index, width, height) {
        const appearsOnLeft = index % 2 === 0;
        const horizontalMinimum = appearsOnLeft ? 0.08 : 0.67;
        const horizontalMaximum = appearsOnLeft ? 0.34 : 0.92;

        return {
            x: randomBetween(
                width * horizontalMinimum,
                width * horizontalMaximum
            ),
            y: randomBetween(height * 0.1, height * 0.5)
        };
    }

    function measureLayout(scene) {
        const imageBounds = scene.image.getBoundingClientRect();
        const viewportWidth = Math.max(1, window.innerWidth);
        const viewportHeight = Math.max(1, window.innerHeight);

        return {
            viewportWidth,
            viewportHeight,
            rocketWidth: imageBounds.width || 160,
            rocketHeight: imageBounds.height || 160,
            startX: viewportWidth / 2,
            startY: viewportHeight * 0.68
        };
    }

    function applyVehiclePresentation(scene, position, flameStrength, glowStrength) {
        const flameStretch = 0.5 + flameStrength * 0.72;
        const flameWidth = 0.78 + Math.min(flameStrength, 1.8) * 0.1;
        const flameOpacity = clamp(0.45 + flameStrength * 0.38, 0, 1);
        const glowScale = 0.86 + glowStrength * 0.2;

        scene.vehicle.style.transform = `translate3d(${position.x}px, ${position.y}px, 0)`;
        scene.vehicle.style.setProperty(
            "--konami-rocket-flame-stretch",
            flameStretch.toFixed(3)
        );
        scene.vehicle.style.setProperty(
            "--konami-rocket-flame-width",
            flameWidth.toFixed(3)
        );
        scene.vehicle.style.setProperty(
            "--konami-rocket-flame-opacity",
            flameOpacity.toFixed(3)
        );
        scene.vehicle.style.setProperty(
            "--konami-rocket-glow-opacity",
            clamp(glowStrength, 0, 1).toFixed(3)
        );
        scene.vehicle.style.setProperty(
            "--konami-rocket-glow-scale",
            glowScale.toFixed(3)
        );
    }

    function createAnimationController() {
        const reducedMotionQuery = window.matchMedia(
            "(prefers-reduced-motion: reduce)"
        );
        let active = false;
        let runId = 0;
        let currentRun = null;

        function isActive() {
            return active;
        }

        function lockScroll(run) {
            run.scrollSnapshot = {
                htmlOverflow: document.documentElement.style.getPropertyValue(
                    "overflow"
                ),
                htmlPriority: document.documentElement.style.getPropertyPriority(
                    "overflow"
                ),
                bodyOverflow: document.body.style.getPropertyValue("overflow"),
                bodyPriority: document.body.style.getPropertyPriority("overflow")
            };

            document.documentElement.style.setProperty("overflow", "hidden");
            document.body.style.setProperty("overflow", "hidden");
        }

        function restoreScroll(run) {
            if (!run.scrollSnapshot) {
                return;
            }

            const snapshot = run.scrollSnapshot;

            if (snapshot.htmlOverflow) {
                document.documentElement.style.setProperty(
                    "overflow",
                    snapshot.htmlOverflow,
                    snapshot.htmlPriority
                );
            } else {
                document.documentElement.style.removeProperty("overflow");
            }

            if (snapshot.bodyOverflow) {
                document.body.style.setProperty(
                    "overflow",
                    snapshot.bodyOverflow,
                    snapshot.bodyPriority
                );
            } else {
                document.body.style.removeProperty("overflow");
            }

            run.scrollSnapshot = null;
        }

        function cleanup(run) {
            if (!run || currentRun !== run) {
                return;
            }

            if (run.animationFrameId) {
                window.cancelAnimationFrame(run.animationFrameId);
                run.animationFrameId = 0;
            }

            if (run.resizeHandler) {
                window.removeEventListener("resize", run.resizeHandler);
                run.resizeHandler = null;
            }

            run.particleEngine?.clear();
            run.scene?.overlay.remove();
            restoreScroll(run);

            currentRun = null;
            active = false;
        }

        function frame(run, timestamp) {
            if (currentRun !== run) {
                return;
            }

            try {
                if (run.startTime === null) {
                    run.startTime = timestamp;
                    run.lastFrameTime = timestamp;
                }

                const elapsed = timestamp - run.startTime;
                const deltaSeconds = Math.min(
                    0.04,
                    Math.max(0, timestamp - run.lastFrameTime) / 1000
                );
                run.lastFrameTime = timestamp;

                const launchStart =
                    CONFIG.fadeInDuration + CONFIG.chargeDuration;
                const launchEnd = launchStart + CONFIG.launchDuration;
                const fadeStart = launchEnd + CONFIG.fireworksTailDuration;
                const finishTime = fadeStart + CONFIG.fadeOutDuration;

                let overlayOpacity = 1;

                if (elapsed < CONFIG.fadeInDuration) {
                    overlayOpacity = easeOutCubic(
                        clamp(elapsed / CONFIG.fadeInDuration)
                    );
                } else if (elapsed >= fadeStart) {
                    overlayOpacity =
                        1 -
                        easeInCubic(
                            clamp(
                                (elapsed - fadeStart) /
                                    CONFIG.fadeOutDuration
                            )
                        );
                }

                run.scene.overlay.style.opacity = overlayOpacity.toFixed(3);

                const layout = run.layout;
                let centerX = layout.startX;
                let centerY = layout.startY;
                let flameStrength = 0.24;
                let glowStrength = 0.16;
                const motionScale = run.reducedMotion ? 0.28 : 1;
                const rocketRevealProgress = easeOutCubic(
                    clamp((elapsed - CONFIG.rocketRevealDelay) / 240)
                );

                if (elapsed < launchStart) {
                    const chargeProgress = easeOutCubic(
                        clamp(
                            (elapsed - CONFIG.fadeInDuration) /
                                CONFIG.chargeDuration
                        )
                    );
                    const vibration = chargeProgress * motionScale;

                    centerX +=
                        Math.sin(elapsed * 0.047) * 1.45 * vibration +
                        Math.sin(elapsed * 0.019) * 0.8 * vibration;
                    centerY +=
                        Math.sin(elapsed * 0.0065) * 2.2 * motionScale;
                    flameStrength = 0.24 + chargeProgress * 0.82;
                    glowStrength = 0.14 + chargeProgress * 0.72;

                    if (elapsed >= CONFIG.rocketRevealDelay) {
                        run.particleEngine.spawnIon(
                            centerX,
                            centerY + layout.rocketHeight * 0.38,
                            flameStrength,
                            deltaSeconds
                        );
                        run.particleEngine.spawnEnergy(
                            centerX,
                            centerY,
                            Math.max(
                                layout.rocketWidth,
                                layout.rocketHeight
                            ) * 0.46,
                            chargeProgress,
                            deltaSeconds
                        );
                    }
                } else if (elapsed < launchEnd) {
                    if (run.scene.overlay.dataset.konamiRocketState !== "launch") {
                        run.scene.overlay.dataset.konamiRocketState = "launch";
                    }

                    const launchProgress = clamp(
                        (elapsed - launchStart) / CONFIG.launchDuration
                    );
                    const acceleratedProgress = easeInCubic(launchProgress);
                    const travelDistance =
                        layout.startY + layout.rocketHeight * 1.55;
                    const lateralDrift =
                        Math.sin(launchProgress * Math.PI * 3.2) *
                            9.5 *
                            motionScale *
                            (1 - launchProgress * 0.25) +
                        Math.sin(launchProgress * Math.PI * 1.2) *
                            3 *
                            motionScale;

                    centerX += lateralDrift;
                    centerY -= travelDistance * acceleratedProgress;
                    flameStrength = 1.02 + launchProgress * 0.8;
                    glowStrength = 0.82;

                    run.particleEngine.spawnIon(
                        centerX,
                        centerY + layout.rocketHeight * 0.38,
                        flameStrength,
                        deltaSeconds
                    );

                    const launchElapsed = elapsed - launchStart;

                    while (
                        run.nextFireworkIndex < run.fireworkSchedule.length &&
                        launchElapsed >=
                            run.fireworkSchedule[run.nextFireworkIndex]
                    ) {
                        const origin = createFireworkOrigin(
                            run.nextFireworkIndex,
                            layout.viewportWidth,
                            layout.viewportHeight
                        );
                        const color = FIREWORK_COLORS[
                            run.nextFireworkIndex % FIREWORK_COLORS.length
                        ];

                        run.particleEngine.burst(
                            origin.x,
                            origin.y,
                            color,
                            randomBetween(0.78, 1.28)
                        );
                        run.nextFireworkIndex += 1;
                    }
                } else {
                    if (run.scene.overlay.dataset.konamiRocketState !== "ending") {
                        run.scene.overlay.dataset.konamiRocketState = "ending";
                    }

                    centerY = -layout.rocketHeight * 1.55;
                    flameStrength = 0;
                    glowStrength = 0;
                }

                const vehiclePosition = {
                    x: centerX - layout.rocketWidth / 2,
                    y: centerY - layout.rocketHeight / 2
                };

                applyVehiclePresentation(
                    run.scene,
                    vehiclePosition,
                    flameStrength,
                    glowStrength
                );
                run.scene.vehicle.style.opacity =
                    elapsed >= launchEnd
                        ? "0"
                        : rocketRevealProgress.toFixed(3);

                run.particleEngine.update(deltaSeconds);
                run.particleEngine.draw();

                if (elapsed >= finishTime) {
                    cleanup(run);
                    return;
                }

                run.animationFrameId = window.requestAnimationFrame((nextTime) =>
                    frame(run, nextTime)
                );
            } catch (_error) {
                cleanup(run);
            }
        }

        function startAnimation(rocketImage, id) {
            const reducedMotion = reducedMotionQuery.matches;
            const mobileViewport = window.innerWidth <= 720;
            const fireworkCount = reducedMotion
                ? 4
                : mobileViewport
                  ? 6
                  : CONFIG.fireworkCount;
            const scene = createScene(rocketImage);
            const run = {
                id,
                scene,
                reducedMotion,
                particleEngine: null,
                layout: null,
                fireworkSchedule: createFireworkSchedule(
                    fireworkCount,
                    CONFIG.launchDuration
                ),
                nextFireworkIndex: 0,
                animationFrameId: 0,
                resizeHandler: null,
                scrollSnapshot: null,
                startTime: null,
                lastFrameTime: 0
            };

            currentRun = run;

            try {
                document.body.append(scene.overlay);
                lockScroll(run);
                run.particleEngine = createParticleEngine(
                    scene.canvas,
                    reducedMotion
                );
                run.layout = measureLayout(scene);
                run.resizeHandler = () => {
                    run.particleEngine.resize();
                    run.layout = measureLayout(scene);
                };
                window.addEventListener("resize", run.resizeHandler);
                run.animationFrameId = window.requestAnimationFrame((time) =>
                    frame(run, time)
                );
            } catch (_error) {
                cleanup(run);
            }
        }

        async function play() {
            if (active) {
                return false;
            }

            active = true;
            const id = ++runId;

            try {
                const image = await loadRocketImage(
                    ROCKET_IMAGE_SRC,
                    CONFIG.imageLoadTimeout
                );

                if (!active || id !== runId) {
                    return false;
                }

                startAnimation(image, id);
                return true;
            } catch (_error) {
                if (id === runId) {
                    active = false;
                }

                return false;
            }
        }

        return {
            isActive,
            play
        };
    }

    function install() {
        const controller = createAnimationController();
        const matcher = createSequenceMatcher(KEY_SEQUENCE, () => {
            void controller.play();
        });

        window.addEventListener("keydown", (event) => {
            if (event.repeat || controller.isActive()) {
                return;
            }

            matcher.push(event.code);
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", install, { once: true });
    } else {
        install();
    }
})();
