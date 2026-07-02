// Ready-to-use circular PNG sprites — no runtime trim/analysis needed.
// Each sprite is 1024x1024 RGBA: cat-in-ball fills the frame, transparent corners.

const CatSprite = (function() {
    const EDGE_OVERSCALE = 1.12; // in-game: crop PNG halos (Hungry Cats ~1.15)

    function previewDisplayD(canvas, fallbackDiameter) {
        const rect = canvas.getBoundingClientRect();
        if (rect.width > 1 && rect.height > 1) {
            return Math.min(rect.width, rect.height);
        }
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

    /** Cartoon mouse — head at −Y, tail at +Y. Use angle π so head points down (falling). */
    function drawMouse(ctx, radius, time, angle) {
        const r = radius;
        const t = time || 0;
        const tailWag = Math.sin(t * 0.022) * 0.55;

        ctx.save();
        if (angle) ctx.rotate(angle);

        // Tail (behind body, wags)
        ctx.save();
        ctx.translate(0, r * 0.55);
        ctx.rotate(tailWag);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(r * 0.35, r * 0.45, r * 0.15, r * 1.05);
        ctx.quadraticCurveTo(-r * 0.1, r * 1.35, -r * 0.05, r * 1.65);
        ctx.strokeStyle = "#8d8d8d";
        ctx.lineWidth = Math.max(2.5, r * 0.14);
        ctx.lineCap = "round";
        ctx.stroke();
        ctx.restore();

        // Body
        ctx.fillStyle = "#b0b0b0";
        ctx.beginPath();
        ctx.ellipse(0, r * 0.08, r * 0.62, r * 0.48, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#757575";
        ctx.lineWidth = Math.max(1.5, r * 0.05);
        ctx.stroke();

        // Head
        ctx.fillStyle = "#a8a8a8";
        ctx.beginPath();
        ctx.arc(0, -r * 0.38, r * 0.38, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Ears
        function ear(ex, tipX, tipY) {
            ctx.fillStyle = "#a8a8a8";
            ctx.beginPath();
            ctx.moveTo(ex, -r * 0.55);
            ctx.lineTo(tipX, tipY);
            ctx.lineTo(ex + (ex > 0 ? r * 0.18 : -r * 0.18), -r * 0.42);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = "#f48fb1";
            ctx.beginPath();
            ctx.moveTo(ex, -r * 0.52);
            ctx.lineTo(tipX * 0.85, tipY * 0.85);
            ctx.lineTo(ex + (ex > 0 ? r * 0.12 : -r * 0.12), -r * 0.44);
            ctx.closePath();
            ctx.fill();
        }
        ear(-r * 0.28, -r * 0.52, -r * 0.92);
        ear(r * 0.28, r * 0.52, -r * 0.92);

        // Eyes
        ctx.fillStyle = "#1a1a1a";
        ctx.beginPath();
        ctx.arc(-r * 0.14, -r * 0.42, r * 0.07, 0, Math.PI * 2);
        ctx.arc(r * 0.14, -r * 0.42, r * 0.07, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(-r * 0.12, -r * 0.44, r * 0.025, 0, Math.PI * 2);
        ctx.arc(r * 0.16, -r * 0.44, r * 0.025, 0, Math.PI * 2);
        ctx.fill();

        // Nose & whiskers
        ctx.fillStyle = "#f48fb1";
        ctx.beginPath();
        ctx.arc(0, -r * 0.28, r * 0.06, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(80,80,80,0.55)";
        ctx.lineWidth = 1;
        [-1, 1].forEach(side => {
            ctx.beginPath();
            ctx.moveTo(side * r * 0.06, -r * 0.28);
            ctx.lineTo(side * r * 0.55, -r * 0.32);
            ctx.moveTo(side * r * 0.06, -r * 0.24);
            ctx.lineTo(side * r * 0.58, -r * 0.22);
            ctx.stroke();
        });

        // Tiny paws
        ctx.fillStyle = "#f48fb1";
        [[-r * 0.35, r * 0.38], [r * 0.35, r * 0.38]].forEach(([px, py]) => {
            ctx.beginPath();
            ctx.arc(px, py, r * 0.09, 0, Math.PI * 2);
            ctx.fill();
        });

        ctx.restore();
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

    function renderMousePreview(canvas, diameter, fitScale = 0.9) {
        const displayD = previewDisplayD(canvas, diameter);
        const ctx = setupPreviewCanvas(canvas, displayD);
        ctx.save();
        ctx.translate(displayD / 2, displayD / 2);
        drawMouse(ctx, (displayD / 2) * fitScale, Date.now(), Math.PI);
        ctx.restore();
    }

    return { draw, drawGolden, drawMouse, drawSpecialRing, renderPreview, renderGoldenPreview, renderMousePreview };
})();

window.CatSprite = CatSprite;
