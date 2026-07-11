// Ready-to-use circular PNG sprites — no runtime trim/analysis needed.
// Each sprite is 1024x1024 RGBA: cat-in-ball fills the frame, transparent corners.

const CatSprite = (function() {
    const EDGE_OVERSCALE = 1.16; // fill the ball circle on high-DPI phones

    function previewDisplayD(canvas, fallbackDiameter) {
        // Deliberately NOT measured via canvas.getBoundingClientRect(): every preview's
        // CSS size is already defined as `fallbackDiameter * gs` (see .next-preview-img,
        // .evolution-img), so computing it the same way here is just as accurate and,
        // unlike a live DOM measurement, isn't fooled by an ancestor still mid-way
        // through a CSS transform animation (e.g. a modal opening with transform:
        // scale(0.3) -> scale(1)) — measuring during that animation used to render the
        // canvas at a fraction of its real resolution, which then got stretched back up
        // and looked blurry once the modal finished opening.
        const gs = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--gs")) || 1;
        return fallbackDiameter * gs;
    }

    function setupPreviewCanvas(canvas, displayD) {
        const dpr = window.devicePixelRatio || 1;
        const px = Math.max(1, Math.round(displayD * dpr));
        canvas.width = px;
        canvas.height = px;
        const ctx = canvas.getContext("2d");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, displayD, displayD);
        return ctx;
    }

    function draw(ctx, img, radius) {
        if (!img || !img.complete || !img.naturalWidth) return;
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.clip();
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        const r = radius * EDGE_OVERSCALE;
        ctx.drawImage(img, -r, -r, r * 2, r * 2);
        ctx.restore();
    }

    function drawGolden(ctx, radius, time) {
        const pulse = 0.92 + 0.08 * Math.sin((time || 0) * 0.006);
        const r = radius * pulse;

        const grad = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r);
        grad.addColorStop(0, "#fff8c4");
        grad.addColorStop(0.35, "#ffd54f");
        grad.addColorStop(0.75, "#ffb300");
        grad.addColorStop(1, "#e68a00");

        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.strokeStyle = "#b8860b";
        ctx.lineWidth = Math.max(2, r * 0.06);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(-r * 0.32, -r * 0.32, r * 0.22, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
        ctx.fill();

        ctx.fillStyle = "#8b6914";
        ctx.font = `bold ${Math.floor(r * 0.55)}px 'Nunito', sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("?", 0, r * 0.05);
    }

    function renderPreview(canvas, img, diameter, fitScale = 0.9) {
        if (!img || !img.complete || !img.naturalWidth) return;
        const displayD = previewDisplayD(canvas, diameter);
        const ctx = setupPreviewCanvas(canvas, displayD);
        ctx.save();
        ctx.translate(displayD / 2, displayD / 2);
        draw(ctx, img, (displayD / 2) * fitScale);
        ctx.restore();
    }

    function renderGoldenPreview(canvas, diameter, fitScale = 0.9) {
        const displayD = previewDisplayD(canvas, diameter);
        const ctx = setupPreviewCanvas(canvas, displayD);
        ctx.save();
        ctx.translate(displayD / 2, displayD / 2);
        drawGolden(ctx, (displayD / 2) * fitScale, Date.now());
        ctx.restore();
    }

    const mouseImg = new Image();
    mouseImg.src = "assets/sprites/mouse.png";

    /** Cartoon mouse — head at −Y, tail at +Y. Use angle π so head points down (falling). */
    function drawMouse(ctx, radius, time, angle, style) {
        if (mouseImg.complete && mouseImg.naturalWidth) {
            ctx.save();
            if (angle) ctx.rotate(angle);
            
            // Draw the mouse image centered
            ctx.beginPath();
            ctx.arc(0, 0, radius, 0, Math.PI * 2);
            ctx.clip();
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";
            const r = radius * EDGE_OVERSCALE;
            ctx.drawImage(mouseImg, -r, -r, r * 2, r * 2);
            ctx.restore();

            if (style && style.label) {
                ctx.save();
                ctx.fillStyle = "rgba(16, 18, 28, 0.82)";
                ctx.beginPath();
                ctx.arc(0, radius * 0.08, radius * 0.24, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = "#ffffff";
                ctx.font = `bold ${Math.floor(radius * 0.33)}px 'Nunito', sans-serif`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(style.label, 0, radius * 0.09);
                ctx.restore();
            }
            return;
        }

        const r = radius;
        const t = time || 0;
        const tailWag = Math.sin(t * 0.022) * 0.55;

        // Custom colors for Puss-in-Boots mouse
        const bodyColor = "#e67e22"; // Orange tabby fur
        const stripeColor = "#d35400"; // Darker orange stripes
        const bellyColor = "#f39c12"; // Golden belly
        const earColor = "#ff8a80"; // Soft pink inner ear
        const strokeColor = "#3e2723"; // Dark brown outlines
        const bootColor = "#2c3e50"; // Dark navy/leather boots
        const bootCuffColor = "#34495e";
        const hatColor = "#1a1a1a"; // Sleek black musketeer hat
        const featherColor = "#f1c40f"; // Rich gold feather
        const swordColor = "#ecf0f1"; // Silver steel
        const swordGlow = "#54a0ff"; // Blue energy glow

        ctx.save();
        if (angle) ctx.rotate(angle);

        // 1. Tail (behind body, wags)
        ctx.save();
        ctx.translate(0, r * 0.5);
        ctx.rotate(tailWag);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(r * 0.35, r * 0.45, r * 0.2, r * 1.05);
        ctx.quadraticCurveTo(-r * 0.1, r * 1.35, -r * 0.05, r * 1.6);
        ctx.strokeStyle = bodyColor;
        ctx.lineWidth = Math.max(3, r * 0.15);
        ctx.lineCap = "round";
        ctx.stroke();
        // Tail stripe details
        ctx.strokeStyle = stripeColor;
        ctx.lineWidth = Math.max(1.5, r * 0.07);
        ctx.stroke();
        ctx.restore();

        // 2. Boots (at the bottom)
        ctx.fillStyle = bootColor;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = Math.max(1.5, r * 0.045);
        [[-r * 0.28, r * 0.52, -0.15], [r * 0.28, r * 0.52, 0.15]].forEach(([px, py, rot]) => {
            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(rot);
            // Boot foot
            ctx.beginPath();
            ctx.ellipse(0, r * 0.05, r * 0.18, r * 0.1, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            // Folded boot cuff
            ctx.fillStyle = bootCuffColor;
            ctx.beginPath();
            ctx.ellipse(0, -r * 0.05, r * 0.15, r * 0.07, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        });

        // 3. Body
        ctx.fillStyle = bodyColor;
        ctx.beginPath();
        ctx.ellipse(0, r * 0.08, r * 0.62, r * 0.48, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = Math.max(2, r * 0.055);
        ctx.stroke();

        // Golden/light belly patch
        ctx.fillStyle = bellyColor;
        ctx.beginPath();
        ctx.ellipse(0, r * 0.18, r * 0.38, r * 0.25, 0, 0, Math.PI * 2);
        ctx.fill();

        // Tabby stripes on body sides
        ctx.strokeStyle = stripeColor;
        ctx.lineWidth = Math.max(2, r * 0.06);
        ctx.lineCap = "round";
        [[-r * 0.5, r * 0.1, 0.4], [r * 0.5, r * 0.1, -0.4]].forEach(([sx, sy, rot]) => {
            ctx.save();
            ctx.translate(sx, sy);
            ctx.rotate(rot);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(r * 0.15, 0);
            ctx.stroke();
            ctx.restore();
        });

        // 4. Head
        ctx.fillStyle = bodyColor;
        ctx.beginPath();
        ctx.arc(0, -r * 0.38, r * 0.38, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Tabby stripes on forehead
        ctx.strokeStyle = stripeColor;
        ctx.lineWidth = Math.max(1.5, r * 0.04);
        [[-r * 0.08, -r * 0.65], [0, -r * 0.68], [r * 0.08, -r * 0.65]].forEach(([sx, sy]) => {
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(sx, sy + r * 0.1);
            ctx.stroke();
        });

        // 5. Large Mouse/Cat Ears
        function ear(ex, tipX, tipY) {
            ctx.fillStyle = bodyColor;
            ctx.beginPath();
            ctx.moveTo(ex, -r * 0.55);
            ctx.lineTo(tipX, tipY);
            ctx.lineTo(ex + (ex > 0 ? r * 0.2 : -r * 0.2), -r * 0.42);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Inner Ear (Pink)
            ctx.fillStyle = earColor;
            ctx.beginPath();
            ctx.moveTo(ex, -r * 0.52);
            ctx.lineTo(tipX * 0.88, tipY * 0.88);
            ctx.lineTo(ex + (ex > 0 ? r * 0.14 : -r * 0.14), -r * 0.44);
            ctx.closePath();
            ctx.fill();
        }
        ear(-r * 0.28, -r * 0.52, -r * 0.92);
        ear(r * 0.28, r * 0.52, -r * 0.92);

        // 6. Huge Musketeer Hat (curved brim, golden feather)
        ctx.fillStyle = hatColor;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = Math.max(2, r * 0.05);

        // Hat dome
        ctx.beginPath();
        ctx.moveTo(-r * 0.26, -r * 0.78);
        ctx.quadraticCurveTo(0, -r * 1.05, r * 0.26, -r * 0.78);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Curled brim (larger and stylish)
        ctx.beginPath();
        ctx.ellipse(0, -r * 0.75, r * 0.48, r * 0.12, -0.06, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Plume / Feather
        ctx.strokeStyle = featherColor;
        ctx.lineWidth = Math.max(3, r * 0.09);
        ctx.beginPath();
        ctx.moveTo(-r * 0.15, -r * 0.85);
        ctx.quadraticCurveTo(-r * 0.45, -r * 1.15, -r * 0.2, -r * 1.35);
        ctx.stroke();

        // 7. Expressive Puss-in-Boots Green Eyes
        ctx.fillStyle = "#ffffff";
        [[-r * 0.14, -r * 0.42], [r * 0.14, -r * 0.42]].forEach(([ex, ey]) => {
            ctx.beginPath();
            ctx.arc(ex, ey, r * 0.09, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        });

        // Vibrant Green Iris
        ctx.fillStyle = "#2ecc71";
        [[-r * 0.14, -r * 0.42], [r * 0.14, -r * 0.42]].forEach(([ex, ey]) => {
            ctx.beginPath();
            ctx.arc(ex, ey, r * 0.065, 0, Math.PI * 2);
            ctx.fill();
        });

        // Large pupils & highlights
        ctx.fillStyle = "#1a1a1a";
        [[-r * 0.14, -r * 0.42], [r * 0.14, -r * 0.42]].forEach(([ex, ey]) => {
            ctx.beginPath();
            ctx.arc(ex, ey, r * 0.045, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.fillStyle = "#ffffff";
        [[-r * 0.11, -r * 0.45], [r * 0.17, -r * 0.45]].forEach(([ex, ey]) => {
            ctx.beginPath();
            ctx.arc(ex, ey, r * 0.02, 0, Math.PI * 2);
            ctx.fill();
        });

        // Cute pink nose & whiskers
        ctx.fillStyle = earColor;
        ctx.beginPath();
        ctx.moveTo(-r * 0.04, -r * 0.29);
        ctx.lineTo(r * 0.04, -r * 0.29);
        ctx.lineTo(0, -r * 0.25);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = "rgba(62,39,35,0.45)";
        ctx.lineWidth = 1;
        [[-1, -r * 0.04], [1, r * 0.04]].forEach(([side, wx]) => {
            ctx.beginPath();
            ctx.moveTo(wx, -r * 0.27);
            ctx.lineTo(side * r * 0.45, -r * 0.3);
            ctx.moveTo(wx, -r * 0.25);
            ctx.lineTo(side * r * 0.48, -r * 0.22);
            ctx.stroke();
        });

        // Left paw (shielding or resting on side)
        ctx.fillStyle = bodyColor;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = Math.max(1.5, r * 0.045);
        ctx.beginPath();
        ctx.arc(-r * 0.35, r * 0.32, r * 0.09, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // 8. Swashbuckler Heroic OUTSTRETCHED ARM (Right)
        ctx.save();
        ctx.fillStyle = bodyColor;
        ctx.beginPath();
        ctx.moveTo(r * 0.3, -r * 0.1);
        ctx.quadraticCurveTo(r * 0.7, -r * 0.3, r * 0.32, -r * 0.52);
        ctx.lineTo(r * 0.22, -r * 0.42);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Large gold/white sleeve cuff
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.ellipse(r * 0.35, -r * 0.48, r * 0.11, r * 0.065, -0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Heroic paw gripping the sword
        ctx.fillStyle = bodyColor;
        ctx.beginPath();
        ctx.arc(r * 0.32, -r * 0.48, r * 0.07, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // 9. Silver Sword Rapier (aligned directly with physical sword detector)
        // Physics segment is vertical from center (bx: x, by: y + reach).
        // In local coordinates: from (0, -r * 0.4) extending straight UP to (0, -r * 1.75).
        ctx.save();
        ctx.lineCap = "round";

        // Outer glow
        ctx.strokeStyle = swordGlow;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = Math.max(3, r * 0.12);
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.42);
        ctx.lineTo(0, -r * 1.76);
        ctx.stroke();

        // Silver blade
        ctx.globalAlpha = 1.0;
        ctx.strokeStyle = swordColor;
        ctx.lineWidth = Math.max(1.8, r * 0.05);
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.42);
        ctx.lineTo(0, -r * 1.76);
        ctx.stroke();

        // Highlight line on blade
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = Math.max(1, r * 0.02);
        ctx.beginPath();
        ctx.moveTo(-r * 0.01, -r * 0.5);
        ctx.lineTo(-r * 0.01, -r * 1.6);
        ctx.stroke();

        // Golden Sword Guard / Hilt
        ctx.strokeStyle = strokeColor;
        ctx.fillStyle = "#f1c40f";
        ctx.lineWidth = Math.max(1.5, r * 0.045);
        ctx.beginPath();
        // Curved basket guard
        ctx.arc(0, -r * 0.42, r * 0.16, Math.PI, 0);
        ctx.stroke();
        ctx.fill();

        ctx.restore();
        ctx.restore();

        if (style && style.label) {
            ctx.save();
            ctx.fillStyle = "rgba(16, 18, 28, 0.82)";
            ctx.beginPath();
            ctx.arc(0, r * 0.08, r * 0.24, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#ffffff";
            ctx.font = `bold ${Math.floor(r * 0.33)}px 'Nunito', sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(style.label, 0, r * 0.09);
            ctx.restore();
        }
    }

    function drawSpecialRing(ctx, radius, special, time) {
        if (!special) return;
        const colors = {
            sticky: "#8bc34a",
            soapy: "#81d4fa",
            heavy: "#78909c",
            explosive: "#ff7043",
            ghost: "#ce93d8"
        };
        const c = colors[special] || "#fff";
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.94, 0, Math.PI * 2);
        ctx.strokeStyle = c;
        ctx.lineWidth = Math.max(2, radius * 0.06);
        ctx.setLineDash(special === "ghost" ? [5, 4] : []);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        ctx.restore();
        if (special === "explosive") {
            ctx.fillStyle = "#ff7043";
            ctx.font = `bold ${Math.floor(radius * 0.35)}px 'Nunito', sans-serif`;
            ctx.textAlign = "center";
            ctx.fillText("💥", 0, -radius * 0.55);
        }
    }

    function renderMousePreview(canvas, diameter, fitScale = 0.9, style) {
        const displayD = previewDisplayD(canvas, diameter);
        const ctx = setupPreviewCanvas(canvas, displayD);
        ctx.save();
        ctx.translate(displayD / 2, displayD / 2);
        drawMouse(ctx, (displayD / 2) * fitScale, Date.now(), Math.PI, style);
        ctx.restore();
    }

    return { draw, drawGolden, drawMouse, drawSpecialRing, renderPreview, renderGoldenPreview, renderMousePreview };
})();

window.CatSprite = CatSprite;
