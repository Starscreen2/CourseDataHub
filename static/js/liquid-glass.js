(() => {
    "use strict";

    const OUTER_GLASS = Object.freeze({
        glassThickness: 80,
        bezelWidth: 40,
        ior: 1.4,
        scaleRatio: 1,
        blur: 2,
        specularOpacity: 1.15,
        specularSat: 1.1,
        tintColor: "255,255,255",
        tintOpacity: 0,
        innerShadow: "rgba(255,255,255,0.12)",
        innerShadowBlur: 2,
        innerShadowSpread: 0,
        balancedSpecular: false,
    });

    const SWITCHER_GLASS = Object.freeze({
        ...OUTER_GLASS,
        glassThickness: 30,
        blur: 1,
        balancedSpecular: true,
    });

    const SVG_NS = "http://www.w3.org/2000/svg";
    const reduceMotion = typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const settleDuration = reduceMotion ? 0 : 300;
    const supportsSvgBackdropFilter = Boolean(
        window.CSS && typeof window.CSS.supports === "function" && (
            window.CSS.supports("backdrop-filter", "url(#liquid-glass-filter)") ||
            window.CSS.supports("-webkit-backdrop-filter", "url(#liquid-glass-filter)")
        )
    );

    let filterSequence = 0;
    let defsRoot = null;

    function getDefsRoot() {
        if (defsRoot) return defsRoot;

        const svg = document.createElementNS(SVG_NS, "svg");
        svg.setAttribute("aria-hidden", "true");
        svg.setAttribute("focusable", "false");
        svg.style.cssText = "position:fixed;width:0;height:0;overflow:hidden;pointer-events:none";
        const defs = document.createElementNS(SVG_NS, "defs");
        svg.append(defs);
        document.body.append(svg);
        defsRoot = defs;
        return defsRoot;
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function drawDisplacementMap(width, height, radius, config) {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.ceil(width));
        canvas.height = Math.max(1, Math.ceil(height));
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return null;

        const pixels = context.createImageData(canvas.width, canvas.height);
        const w = canvas.width;
        const h = canvas.height;
        const r = clamp(radius, 0, Math.min(w, h) / 2);
        const halfW = w / 2;
        const halfH = h / 2;
        const bezel = Math.max(1, Math.min(config.bezelWidth, Math.min(w, h) * 0.42));
        const iorFactor = clamp((config.ior - 1) / config.ior, 0, 1);
        const maxOffset = (config.glassThickness >= 60 ? 36 : 52) * (0.75 + iorFactor);

        for (let y = 0; y < h; y += 1) {
            for (let x = 0; x < w; x += 1) {
                const qx = Math.abs(x + 0.5 - halfW) - (halfW - r);
                const qy = Math.abs(y + 0.5 - halfH) - (halfH - r);
                const outsideX = Math.max(qx, 0);
                const outsideY = Math.max(qy, 0);
                const signedDistance = Math.min(Math.max(qx, qy), 0) + Math.hypot(outsideX, outsideY) - r;
                const edgeDistance = Math.max(0, -signedDistance);
                const influence = Math.sin((1 - clamp(edgeDistance / bezel, 0, 1)) * Math.PI / 2);
                let normalX = 0;
                let normalY = 0;

                if (qx > 0 && qy > 0) {
                    const length = Math.hypot(outsideX, outsideY) || 1;
                    normalX = Math.sign(x + 0.5 - halfW) * outsideX / length;
                    normalY = Math.sign(y + 0.5 - halfH) * outsideY / length;
                } else if (qx > qy) {
                    normalX = Math.sign(x + 0.5 - halfW);
                } else {
                    normalY = Math.sign(y + 0.5 - halfH);
                }

                const offset = maxOffset * influence;
                const index = (y * w + x) * 4;
                pixels.data[index] = clamp(Math.round(128 + normalX * offset), 0, 255);
                pixels.data[index + 1] = clamp(Math.round(128 + normalY * offset), 0, 255);
                pixels.data[index + 2] = 128;
                pixels.data[index + 3] = 255;
            }
        }

        context.putImageData(pixels, 0, 0);
        return canvas.toDataURL("image/png");
    }

    function drawSpecularMap(width, height, config) {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.ceil(width));
        canvas.height = Math.max(1, Math.ceil(height));
        const context = canvas.getContext("2d");
        if (!context) return null;

        const reflection = Math.min(0.62, config.specularOpacity * (config.balancedSpecular ? 0.42 : 0.54));
        const lowerReflection = config.balancedSpecular ? 0.14 : 0.1;
        const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, `rgba(255,255,255,${reflection})`);
        gradient.addColorStop(0.08, "rgba(255,255,255,0.14)");
        gradient.addColorStop(0.48, "rgba(255,255,255,0)");
        gradient.addColorStop(0.92, "rgba(255,255,255,0)");
        gradient.addColorStop(1, `rgba(255,255,255,${lowerReflection})`);
        context.fillStyle = gradient;
        context.fillRect(0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/png");
    }

    function addSvgNode(parent, name, attributes) {
        const node = document.createElementNS(SVG_NS, name);
        Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value)));
        parent.append(node);
        return node;
    }

    function buildSvgFilter(element, config) {
        const rect = element.getBoundingClientRect();
        const width = Math.max(1, Math.ceil(rect.width));
        const height = Math.max(1, Math.ceil(rect.height));
        const style = getComputedStyle(element);
        const radius = Number.parseFloat(style.borderTopLeftRadius) || Math.min(width, height) / 2;
        element.style.setProperty(
            "--glass-inner-shadow",
            `inset 0 0 ${config.innerShadowBlur}px ${config.innerShadowSpread}px ${config.innerShadow}`
        );
        const displacementUrl = drawDisplacementMap(width, height, radius, config);
        const specularUrl = drawSpecularMap(width, height, config);
        if (!displacementUrl || !specularUrl) return false;

        const id = element.dataset.liquidGlassFilterId || `liquid-glass-filter-${++filterSequence}`;
        element.dataset.liquidGlassFilterId = id;
        const defs = getDefsRoot();
        const existing = document.getElementById(id);
        if (existing) existing.remove();

        const filter = addSvgNode(defs, "filter", {
            id,
            x: 0,
            y: 0,
            width,
            height,
            filterUnits: "userSpaceOnUse",
            primitiveUnits: "userSpaceOnUse",
            "color-interpolation-filters": "sRGB",
        });

        const displacement = addSvgNode(filter, "feImage", {
            x: 0,
            y: 0,
            width,
            height,
            preserveAspectRatio: "none",
            result: "liquidDisplacement",
        });
        displacement.setAttribute("href", displacementUrl);
        displacement.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", displacementUrl);

        addSvgNode(filter, "feDisplacementMap", {
            in: "SourceGraphic",
            in2: "liquidDisplacement",
            scale: Math.round(config.glassThickness * config.scaleRatio * (1 + (config.ior - 1) * 0.35)),
            xChannelSelector: "R",
            yChannelSelector: "G",
            result: "liquidRefracted",
        });
        addSvgNode(filter, "feGaussianBlur", {
            in: "liquidRefracted",
            stdDeviation: config.blur,
            result: "liquidSoftened",
        });
        addSvgNode(filter, "feColorMatrix", {
            in: "liquidSoftened",
            type: "saturate",
            values: config.specularSat,
            result: "liquidSaturated",
        });

        const tint = addSvgNode(filter, "feFlood", {
            "flood-color": `rgb(${config.tintColor})`,
            "flood-opacity": config.tintOpacity,
            result: "liquidTint",
        });
        addSvgNode(filter, "feBlend", {
            in: "liquidSaturated",
            in2: "liquidTint",
            mode: "normal",
            result: "liquidTinted",
        });

        const specular = addSvgNode(filter, "feImage", {
            x: 0,
            y: 0,
            width,
            height,
            preserveAspectRatio: "none",
            result: "liquidSpecular",
        });
        specular.setAttribute("href", specularUrl);
        specular.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", specularUrl);
        addSvgNode(filter, "feBlend", {
            in: "liquidTinted",
            in2: "liquidSpecular",
            mode: "screen",
        });

        if (supportsSvgBackdropFilter) {
            element.style.backdropFilter = `url(#${id})`;
            element.style.webkitBackdropFilter = `url(#${id})`;
            element.dataset.liquidGlassRefraction = "svg";
        }

        return true;
    }

    function createGlassSurface(element, config) {
        let rebuildFrame = 0;
        let staleDuringMotion = false;
        const rebuild = () => {
            rebuildFrame = 0;
            if (!element.isConnected || element.getBoundingClientRect().width < 1) return;
            if (element.closest(".liquid-glass-switcher")?.dataset.liquidGlassMoving === "true") {
                staleDuringMotion = true;
                return;
            }
            staleDuringMotion = false;
            buildSvgFilter(element, config);
        };
        const scheduleRebuild = () => {
            if (rebuildFrame || !supportsSvgBackdropFilter) return;
            rebuildFrame = requestAnimationFrame(rebuild);
        };

        if (supportsSvgBackdropFilter) {
            if (typeof ResizeObserver === "function") {
                const observer = new ResizeObserver(scheduleRebuild);
                observer.observe(element);
                element.__liquidGlassResizeObserver = observer;
            } else {
                window.addEventListener("resize", scheduleRebuild, { passive: true });
            }
            scheduleRebuild();
        }

        element.__rebuildLiquidGlass = () => {
            if (staleDuringMotion) staleDuringMotion = false;
            scheduleRebuild();
        };
    }

    function setCapsulePosition(container, capsule, item, instant = false) {
        const containerRect = container.getBoundingClientRect();
        const itemRect = item.getBoundingClientRect();
        if (containerRect.width < 1 || itemRect.width < 1) return false;

        const x = itemRect.left - containerRect.left - container.clientLeft + container.scrollLeft;
        if (instant) capsule.style.transition = "none";
        container.style.setProperty("--glass-capsule-x", `${x}px`);
        container.style.setProperty("--glass-capsule-width", `${itemRect.width}px`);
        if (instant) requestAnimationFrame(() => { capsule.style.removeProperty("transition"); });
        return true;
    }

    function setupSwitcher(container) {
        const items = Array.from(container.querySelectorAll(".nav-link, .view-btn"));
        if (items.length < 2) return;

        container.classList.add("liquid-glass-switcher");
        container.setAttribute("data-liquid-glass-enhanced", "true");
        const capsule = document.createElement(container.matches("ul") ? "li" : "span");
        capsule.className = "liquid-glass-capsule";
        capsule.setAttribute("aria-hidden", "true");
        if (capsule.matches("li")) capsule.style.listStyle = "none";
        container.prepend(capsule);

        const config = SWITCHER_GLASS;
        createGlassSurface(container, OUTER_GLASS);
        createGlassSurface(capsule, config);

        let activeIndex = Math.max(0, items.findIndex((item) => item.classList.contains("active")));
        let gesture = null;
        let moveFrame = 0;
        let pendingX = 0;
        let settleTimer = 0;
        let navigationTimer = 0;
        let suppressNextClick = false;

        function updateActiveLabel(index) {
            activeIndex = clamp(index, 0, items.length - 1);
            items.forEach((item, itemIndex) => {
                const selected = itemIndex === activeIndex;
                item.classList.toggle("active", selected);
                if (item.matches("a")) {
                    if (selected) item.setAttribute("aria-current", "page");
                    else item.removeAttribute("aria-current");
                }
                if (item.matches("button")) item.setAttribute("aria-pressed", String(selected));
            });
        }

        function updateSelected(index) {
            updateActiveLabel(index);
            return setCapsulePosition(container, capsule, items[activeIndex]);
        }

        function finishMotion() {
            if (gesture || container.dataset.liquidGlassMoving !== "true") return;
            window.clearTimeout(settleTimer);
            settleTimer = window.setTimeout(() => {
                if (gesture) return;
                container.dataset.liquidGlassMoving = "false";
                if (supportsSvgBackdropFilter) {
                    capsule.style.removeProperty("backdrop-filter");
                    capsule.style.removeProperty("-webkit-backdrop-filter");
                }
                capsule.__rebuildLiquidGlass?.();
                container.__rebuildLiquidGlass?.();
            }, settleDuration);
        }

        function nearestIndexAt(x) {
            const centers = items.map((item) => {
                const rect = item.getBoundingClientRect();
                return rect.left + rect.width / 2;
            });
            let index = 0;
            for (let i = 0; i < centers.length - 1; i += 1) {
                if (x >= (centers[i] + centers[i + 1]) / 2) index = i + 1;
                else break;
            }
            return index;
        }

        function interpolateAt(x) {
            const centers = items.map((item) => {
                const rect = item.getBoundingClientRect();
                return rect.left + rect.width / 2;
            });
            const minX = centers[0];
            const maxX = centers[centers.length - 1];
            const boundedX = clamp(x, minX, maxX);
            let start = 0;
            while (start < centers.length - 2 && boundedX > centers[start + 1]) start += 1;
            const end = Math.min(start + 1, centers.length - 1);
            const span = centers[end] - centers[start] || 1;
            const progress = clamp((boundedX - centers[start]) / span, 0, 1);
            const parentRect = container.getBoundingClientRect();
            const startRect = items[start].getBoundingClientRect();
            const endRect = items[end].getBoundingClientRect();
            const left = (startRect.left - parentRect.left - container.clientLeft + container.scrollLeft) * (1 - progress) +
                (endRect.left - parentRect.left - container.clientLeft + container.scrollLeft) * progress;
            const width = startRect.width * (1 - progress) + endRect.width * progress;
            container.style.setProperty("--glass-capsule-x", `${clamp(left, 0, Math.max(0, container.clientWidth - width))}px`);
            container.style.setProperty("--glass-capsule-width", `${width}px`);
            const nextIndex = nearestIndexAt(boundedX);
            if (nextIndex !== activeIndex) updateActiveLabel(nextIndex);
        }

        function queueMove(x) {
            pendingX = x;
            if (moveFrame) return;
            moveFrame = requestAnimationFrame(() => {
                moveFrame = 0;
                if (gesture?.dragging) interpolateAt(pendingX);
            });
        }

        function beginGesture(id, x, y, kind, target) {
            if (gesture) return;
            gesture = {
                id,
                startX: x,
                startY: y,
                lastX: x,
                lastY: y,
                startIndex: activeIndex,
                dragging: false,
                cancelled: false,
                kind,
                target,
            };
        }

        function moveGesture(id, x, y, event) {
            if (!gesture || gesture.id !== id || gesture.cancelled) return;
            const dx = x - gesture.startX;
            const dy = y - gesture.startY;
            gesture.lastX = x;
            gesture.lastY = y;

            if (!gesture.dragging) {
                if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
                if (Math.abs(dx) <= Math.abs(dy)) {
                    gesture.cancelled = true;
                    return;
                }
                gesture.dragging = true;
                container.classList.add("is-dragging");
                container.dataset.liquidGlassMoving = "true";
                if (supportsSvgBackdropFilter) {
                    capsule.style.backdropFilter = "blur(1px) saturate(1.1)";
                    capsule.style.webkitBackdropFilter = "blur(1px) saturate(1.1)";
                }
                window.clearTimeout(settleTimer);
                if (gesture.kind === "pointer" && gesture.target?.setPointerCapture) {
                    try { gesture.target.setPointerCapture(gesture.id); } catch (_) { /* capture may no longer be available */ }
                }
            }

            if (event?.cancelable) event.preventDefault();
            queueMove(x);
        }

        function endGesture(id, cancelled = false) {
            if (!gesture || gesture.id !== id) return;
            const ended = gesture;
            gesture = null;
            if (ended.dragging) {
                container.classList.remove("is-dragging");
                if (cancelled || ended.cancelled) {
                    updateSelected(ended.startIndex);
                } else {
                    const index = nearestIndexAt(ended.lastX);
                    updateSelected(index);
                    suppressNextClick = true;
                    window.setTimeout(() => { suppressNextClick = false; }, 700);
                    if (items[index].matches("button") && index !== ended.startIndex) items[index].click();
                    else if (items[index].href && index !== ended.startIndex) {
                        window.clearTimeout(navigationTimer);
                        navigationTimer = window.setTimeout(() => window.location.assign(items[index].href), settleDuration + 10);
                    }
                }
                finishMotion();
            } else if (!cancelled) {
                updateSelected(Math.max(0, items.findIndex((item) => item.classList.contains("active"))));
                finishMotion();
            } else {
                gesture = null;
            }
        }

        container.addEventListener("pointerdown", (event) => {
            if (event.pointerType === "touch" || event.button !== 0) return;
            beginGesture(event.pointerId, event.clientX, event.clientY, "pointer", event.currentTarget);
        });
        container.addEventListener("pointermove", (event) => {
            if (event.pointerType === "touch") return;
            moveGesture(event.pointerId, event.clientX, event.clientY, event);
        });
        container.addEventListener("pointerup", (event) => {
            if (event.pointerType !== "touch") endGesture(event.pointerId);
        });
        container.addEventListener("pointercancel", (event) => {
            if (event.pointerType !== "touch") endGesture(event.pointerId, true);
        });

        let activeTouchId = null;
        container.addEventListener("touchstart", (event) => {
            if (event.touches.length !== 1) return;
            const touch = event.touches[0];
            activeTouchId = touch.identifier;
            beginGesture(touch.identifier, touch.clientX, touch.clientY, "touch", null);
        }, { passive: true });
        container.addEventListener("touchmove", (event) => {
            if (activeTouchId === null) return;
            const touch = Array.from(event.touches).find((item) => item.identifier === activeTouchId);
            if (!touch) return;
            moveGesture(touch.identifier, touch.clientX, touch.clientY, event);
        }, { passive: false });
        const endTouch = (event, cancelled = false) => {
            if (activeTouchId === null) return;
            const touch = Array.from(event.changedTouches).find((item) => item.identifier === activeTouchId);
            if (!touch) return;
            const id = activeTouchId;
            activeTouchId = null;
            endGesture(id, cancelled);
        };
        container.addEventListener("touchend", (event) => endTouch(event), { passive: true });
        container.addEventListener("touchcancel", (event) => endTouch(event, true), { passive: true });

        container.addEventListener("click", (event) => {
            if (suppressNextClick && event.detail > 0) {
                event.preventDefault();
                event.stopImmediatePropagation();
                suppressNextClick = false;
                return;
            }
            requestAnimationFrame(() => {
                const selected = Math.max(0, items.findIndex((item) => item.classList.contains("active")));
                updateSelected(selected);
                container.dataset.liquidGlassMoving = "true";
                finishMotion();
            });
        }, true);

        container.addEventListener("contextmenu", (event) => {
            if (gesture?.dragging) event.preventDefault();
        });
        container.addEventListener("dragstart", (event) => {
            if (gesture?.dragging) event.preventDefault();
        });

        if (typeof ResizeObserver === "function") {
            const resizeObserver = new ResizeObserver(() => {
                if (!gesture?.dragging) updateSelected(activeIndex);
                finishMotion();
            });
            resizeObserver.observe(container);
            items.forEach((item) => resizeObserver.observe(item));
        } else {
            window.addEventListener("resize", () => updateSelected(activeIndex), { passive: true });
        }

        if (document.fonts?.ready) {
            document.fonts.ready.then(() => updateSelected(activeIndex));
        }
        updateActiveLabel(activeIndex);
        updateSelected(activeIndex);
    }

    function initialize() {
        document.querySelectorAll(".navbar > .container").forEach((element) => createGlassSurface(element, OUTER_GLASS));
        document.querySelectorAll(".nav-tabs, .view-toggle").forEach(setupSwitcher);
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
    else initialize();
})();
