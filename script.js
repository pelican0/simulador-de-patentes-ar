/* Simulador de patentes Mercosur (Argentina) */
(function () {
	"use strict";

	const ALPHABET = "ABCDEFGHJKLMNPRSTUVWXYZ"; // sin I, O, Q para evitar confusiones

	/** PRNG determinista (sfc32) para obtener secuencias reproducibles con una semilla textual */
	function xmur3(str) {
		let h = 1779033703 ^ str.length;
		for (let i = 0; i < str.length; i++) {
			h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
			h = (h << 13) | (h >>> 19);
		}
		return function () {
			h = Math.imul(h ^ (h >>> 16), 2246822507);
			h = Math.imul(h ^ (h >>> 13), 3266489909);
			h ^= h >>> 16;
			return h >>> 0;
		};
	}
	function sfc32(a, b, c, d) {
		return function () {
			a >>>= 0;
			b >>>= 0;
			c >>>= 0;
			d >>>= 0;
			let t = (a + b) | 0;
			a = b ^ (b >>> 9);
			b = (c + (c << 3)) | 0;
			c = (c << 21) | (c >>> 11);
			d = (d + 1) | 0;
			t = (t + d) | 0;
			c = (c + t) | 0;
			return (t >>> 0) / 4294967296;
		};
	}
	function createRngFromSeed(seedText) {
		if (!seedText) {
			return Math.random;
		}
		const seedFunc = xmur3(seedText);
		return sfc32(seedFunc(), seedFunc(), seedFunc(), seedFunc());
	}

	function generateRandomPlateAuto(rng) {
		const pick = () => ALPHABET[Math.floor(rng() * ALPHABET.length)];
		const l1 = pick();
		const l2 = pick();
		const num = Math.floor(rng() * 1000)
			.toString()
			.padStart(3, "0");
		const l3 = pick();
		const l4 = pick();
		return `${l1}${l2}${num}${l3}${l4}`; // "AB123CD"
	}

	function generateRandomPlateMoto(rng) {
		const pick = () => ALPHABET[Math.floor(rng() * ALPHABET.length)];
		const d = () => Math.floor(rng() * 10);
		const top = `${pick()}${d()}${d()}`; // A16
		const bottom = `${d()}${pick()}${pick()}${pick()}`; // 7DUM
		return `${top}\n${bottom}`; // dos renglones
	}

	// Formato 1994: "ABC 123"
	function generateRandomPlateAuto1994(rng) {
		const pick = () => ALPHABET[Math.floor(rng() * ALPHABET.length)];
		const l1 = pick();
		const l2 = pick();
		const l3 = pick();
		const num = Math.floor(rng() * 1000)
			.toString()
			.padStart(3, "0");
		return `${l1}${l2}${l3} ${num}`;
	}

	function formatForDisplayAuto(plate) {
		// "AB123CD" -> "AB 123 CD"
		return `${plate.slice(0, 2)} ${plate.slice(2, 5)} ${plate.slice(5)}`;
	}

	function toLogString(plateRaw) {
		return String(plateRaw).replace(/\s+/g, " ").trim();
	}

	const $ = (sel) => document.querySelector(sel);
	const overlay = $("#overlay");
	const plateText = $("#plateText");
	const plateImg = $("#plateImg");
	const plateContainer = $("#plateContainer");
	const intervalInput = $("#intervalInput");
	const seedInput = $("#seedInput");
	const modeSelect = $("#modeSelect");
	const motionSelect = $("#motionSelect");
	const screenTimeInput = $("#screenTimeInput");
	const screenTimeControl = $("#screenTimeControl");
	const startBtn = $("#startBtn");
	const stopBtn = $("#stopBtn");
	const nextBtn = $("#nextBtn");
	const logToggle = $("#logToggle");
	const chooseFileBtn = $("#chooseFileBtn");
	const exportBtn = $("#exportBtn");
	const fileNameEl = $("#fileName");

	let timerId = null;
	let motionRaf = null;
	let running = false;
	let phase = "show"; // "show" | "blank"
	let rng = createRngFromSeed("");
	let lastPlate = "AG123CD";
	let logEntries = [];
	let logFileHandle = null; // FileSystemFileHandle (solo sesión actual)
	let mode = "auto"; // "auto" | "moto" | "auto1994"
	let movingSize = null; // { w, h } tamaño congelado de la chapa en movimiento
	let motionSpacer = null;

	function fitTextToOverlay() {
		// Ajusta el tamaño de fuente para que NUNCA se salga del recuadro,
		// considerando tanto alto como ancho y permitiendo 1-2 renglones.
		const cw = overlay.clientWidth;
		const ch = overlay.clientHeight;
		if (cw === 0 || ch === 0) return;

		// Límite superior razonable: cercano al alto de la caja
		let low = 8;
		// Para motos hacemos la tipografía un poco más chica de forma intencional
		const maxFactor = (typeof mode !== "undefined" && mode === "moto") ? 0.74 : 0.9;
		let high = Math.max(16, Math.floor(ch * maxFactor));
		let best = low;

		const fits = () => plateText.scrollWidth <= cw && plateText.scrollHeight <= ch;

		// Si el tamaño alto inicial no entra, iremos bajando con búsqueda binaria
		while (low <= high) {
			const mid = Math.floor((low + high) / 2);
			plateText.style.fontSize = mid + "px";
			// Forzamos reflow para medir correctamente
			// eslint-disable-next-line no-unused-expressions
			plateText.offsetHeight;
			if (fits()) {
				best = mid;
				low = mid + 1;
			} else {
				high = mid - 1;
			}
		}
		plateText.style.fontSize = best + "px";
	}

	function renderRandom() {
		let plate;
		if (mode === "moto") {
			plate = generateRandomPlateMoto(rng); // "A16\n7DUM"
			plateText.textContent = plate; // soporta \n gracias a white-space: pre-line
		} else if (mode === "auto1994") {
			plate = generateRandomPlateAuto1994(rng); // "ABC 123"
			plateText.textContent = plate;
		} else {
			plate = generateRandomPlateAuto(rng); // "AB123CD"
			plateText.textContent = formatForDisplayAuto(plate);
		}
		fitTextToOverlay();
		lastPlate = plate;
		return plate;
	}

	function setHidden(isHidden) {
		if (isHidden) plateText.classList.add("is-hidden");
		else plateText.classList.remove("is-hidden");
	}

	function scheduleNext(ms) {
		timerId = setTimeout(tick, ms);
	}

	function isMotionOn() {
		return motionSelect.value === "down" || motionSelect.value === "random";
	}

	function syncMotionControls() {
		if (isMotionOn()) screenTimeControl.removeAttribute("hidden");
		else screenTimeControl.setAttribute("hidden", "");
	}

	function getViewportSize() {
		return { w: window.innerWidth, h: window.innerHeight };
	}

	function clampScreenTime(value) {
		if (!Number.isFinite(value) || value < 100) return 100;
		if (value > 600000) return 600000;
		return value;
	}

	function cancelMotionAnim() {
		if (motionRaf) {
			cancelAnimationFrame(motionRaf);
			motionRaf = null;
		}
	}

	function enterMotionLayout() {
		if (plateContainer.classList.contains("is-moving")) return;
		const w = plateContainer.offsetWidth;
		const h = plateContainer.offsetHeight;
		movingSize = { w, h };
		if (!motionSpacer) {
			motionSpacer = document.createElement("div");
			motionSpacer.className = "motion-spacer";
			motionSpacer.setAttribute("aria-hidden", "true");
			plateContainer.parentNode.insertBefore(motionSpacer, plateContainer);
		}
		motionSpacer.style.height = h + "px";
		plateContainer.style.width = w + "px";
		plateContainer.style.visibility = "";
		plateContainer.classList.add("is-moving");
		document.body.classList.add("motion-on");
	}

	function exitMotionLayout() {
		cancelMotionAnim();
		plateContainer.classList.remove("is-moving");
		plateContainer.style.width = "";
		plateContainer.style.transform = "";
		plateContainer.style.visibility = "";
		document.body.classList.remove("motion-on");
		movingSize = null;
		if (motionSpacer) {
			motionSpacer.remove();
			motionSpacer = null;
		}
	}

	function randomRange(min, max) {
		return min + Math.random() * (max - min);
	}

	function pickItem(arr) {
		return arr[Math.floor(Math.random() * arr.length)];
	}

	function pointOutsideEdge(edge, plateW, plateH, vw, vh) {
		const alongX = () => randomRange(-plateW * 0.25, vw - plateW * 0.75);
		const alongY = () => randomRange(-plateH * 0.25, vh - plateH * 0.75);
		switch (edge) {
			case "top":
				return { x: alongX(), y: -plateH };
			case "bottom":
				return { x: alongX(), y: vh };
			case "left":
				return { x: -plateW, y: alongY() };
			case "right":
			default:
				return { x: vw, y: alongY() };
		}
	}

	function buildDownPath() {
		const { w: vw, h: vh } = getViewportSize();
		const { w, h } = movingSize;
		const x = (vw - w) / 2;
		return [
			{ x, y: -h },
			{ x, y: vh },
		];
	}

	function buildRandomPath() {
		const { w: vw, h: vh } = getViewportSize();
		const { w: pw, h: ph } = movingSize;
		const edges = ["top", "right", "bottom", "left"];
		const startEdge = pickItem(edges);
		const endEdge = pickItem(edges.filter((e) => e !== startEdge));
		const start = pointOutsideEdge(startEdge, pw, ph, vw, vh);
		const end = pointOutsideEdge(endEdge, pw, ph, vw, vh);

		const turns = 2 + Math.floor(Math.random() * 4);
		const points = [start];
		let x = start.x;
		let y = start.y;
		const cx = (vw - pw) / 2;
		const cy = (vh - ph) / 2;
		let heading = Math.atan2(cy - y, cx - x);

		for (let i = 0; i < turns; i++) {
			heading += randomRange(-Math.PI * 0.85, Math.PI * 0.85);
			const dist = randomRange(Math.min(vw, vh) * 0.22, Math.min(vw, vh) * 0.7);
			x += Math.cos(heading) * dist;
			y += Math.sin(heading) * dist;
			x = Math.min(vw - 16, Math.max(-pw + 16, x));
			y = Math.min(vh - 16, Math.max(-ph + 16, y));
			points.push({ x, y });
		}
		points.push(end);
		return points;
	}

	function setPlatePosition(x, y) {
		plateContainer.style.transform = `translate3d(${x}px, ${y}px, 0)`;
	}

	function animateAlongPath(points, duration, onDone) {
		cancelMotionAnim();
		const segs = [];
		let total = 0;
		for (let i = 1; i < points.length; i++) {
			const dx = points[i].x - points[i - 1].x;
			const dy = points[i].y - points[i - 1].y;
			const len = Math.hypot(dx, dy);
			segs.push({ from: points[i - 1], to: points[i], len, acc: total });
			total += len;
		}
		if (total < 1) total = 1;

		setPlatePosition(points[0].x, points[0].y);
		const t0 = performance.now();

		function frame(now) {
			const t = Math.min(1, (now - t0) / duration);
			const dist = t * total;
			let x = points[points.length - 1].x;
			let y = points[points.length - 1].y;
			for (let i = segs.length - 1; i >= 0; i--) {
				if (dist >= segs[i].acc) {
					const s = segs[i];
					const u = s.len === 0 ? 1 : (dist - s.acc) / s.len;
					x = s.from.x + (s.to.x - s.from.x) * u;
					y = s.from.y + (s.to.y - s.from.y) * u;
					break;
				}
			}
			setPlatePosition(x, y);
			if (t < 1) {
				motionRaf = requestAnimationFrame(frame);
			} else {
				motionRaf = null;
				if (typeof onDone === "function") onDone();
			}
		}

		motionRaf = requestAnimationFrame(frame);
	}

	function showMovingPlate() {
		enterMotionLayout();
		plateContainer.style.visibility = "";
		const plate = renderRandom();
		setHidden(false);
		const duration = clampScreenTime(parseInt(screenTimeInput.value, 10));
		screenTimeInput.value = String(duration);
		const path = motionSelect.value === "random" ? buildRandomPath() : buildDownPath();
		phase = "show";
		recordPlate(plate);
		animateAlongPath(path, duration, () => {
			phase = "blank";
			if (running) {
				plateContainer.style.visibility = "hidden";
				scheduleNext(clampInterval(parseInt(intervalInput.value, 10)));
			} else {
				exitMotionLayout();
				setHidden(false);
				fitTextToOverlay();
			}
		});
		return plate;
	}

	function pad2(n) {
		return String(n).padStart(2, "0");
	}
	function formatTimestamp(d) {
		const yyyy = d.getFullYear();
		const mm = pad2(d.getMonth() + 1);
		const dd = pad2(d.getDate());
		const hh = pad2(d.getHours());
		const mi = pad2(d.getMinutes());
		const ss = pad2(d.getSeconds());
		return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
	}
	function recordPlate(plate) {
		if (!logToggle.checked) return;
		const line = `${formatTimestamp(new Date())} - ${toLogString(plate)}`;
		logEntries.push(line);
		appendToFileIfChosen(line + "\n");
	}
	async function appendToFileIfChosen(text) {
		try {
			if (!logFileHandle) return;
			const file = await logFileHandle.getFile();
			const size = file.size;
			const writable = await logFileHandle.createWritable({ keepExistingData: true });
			await writable.write({ type: "write", position: size, data: text });
			await writable.close();
		} catch (err) {
			console.warn("No se pudo escribir en el archivo:", err);
		}
	}
	async function chooseLogFile() {
		if (!window.showSaveFilePicker) {
			alert("Tu navegador no soporta elegir archivos directamente.\nUsa “Exportar .txt” para descargar el log.");
			return;
		}
		try {
			logFileHandle = await window.showSaveFilePicker({
				suggestedName: "patentes-log.txt",
				types: [{ description: "Texto", accept: { "text/plain": [".txt"] } }],
				excludeAcceptAllOption: false,
			});
			fileNameEl.textContent = logFileHandle.name || "patentes-log.txt";
			// Si ya hay buffer acumulado, volcarlo
			if (logEntries.length) {
				await appendToFileIfChosen(logEntries.join("\n") + "\n");
			}
		} catch (err) {
			if (err && err.name !== "AbortError") {
				console.warn("Error eligiendo archivo:", err);
			}
		}
	}
	function exportLog() {
		if (!logEntries.length) {
			alert("No hay registros aún.");
			return;
		}
		const blob = new Blob([logEntries.join("\n") + "\n"], { type: "text/plain;charset=utf-8" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "patentes-log.txt";
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
	}

	function tick() {
		if (!running) return;
		const ms = clampInterval(parseInt(intervalInput.value, 10));
		if (isMotionOn()) {
			showMovingPlate();
			return;
		}
		if (phase === "show") {
			// Pasamos a "en blanco" por ms
			setHidden(true);
			phase = "blank";
		} else {
			// Mostramos la siguiente patente por ms
			const plate = renderRandom();
			setHidden(false);
			phase = "show";
			recordPlate(plate);
		}
		scheduleNext(ms);
	}

	function start() {
		const ms = clampInterval(parseInt(intervalInput.value, 10));
		intervalInput.value = String(ms);
		saveSettings();
		stopTimers();
		running = true;
		if (isMotionOn()) {
			showMovingPlate();
			return;
		}
		exitMotionLayout();
		// Comenzamos mostrando y luego vendrá el blanco
		phase = "show";
		const plate = renderRandom();
		setHidden(false);
		recordPlate(plate);
		scheduleNext(ms);
	}

	function stopTimers() {
		running = false;
		if (timerId) {
			clearTimeout(timerId);
			timerId = null;
		}
		cancelMotionAnim();
	}

	function stop() {
		stopTimers();
		if (isMotionOn()) {
			exitMotionLayout();
			setHidden(false);
			fitTextToOverlay();
		}
	}

	function clampInterval(value) {
		if (!Number.isFinite(value) || value < 200) return 200;
		if (value > 600000) return 600000; // 10 min máx
		return value;
	}

	function loadSettings() {
		try {
			const raw = localStorage.getItem("simu-plate-settings");
			if (!raw) return;
			const obj = JSON.parse(raw);
			if (typeof obj.interval === "number") intervalInput.value = String(obj.interval);
			if (typeof obj.seed === "string") seedInput.value = obj.seed;
			if (obj.motion === "down" || obj.motion === "random" || obj.motion === "none") {
				motionSelect.value = obj.motion;
			}
			if (typeof obj.screenTime === "number") screenTimeInput.value = String(obj.screenTime);
		} catch {
			/* ignore */
		}
		syncMotionControls();
	}
	function saveSettings() {
		try {
			const obj = {
				interval: clampInterval(parseInt(intervalInput.value, 10)),
				seed: seedInput.value || "",
				motion: motionSelect.value || "none",
				screenTime: clampScreenTime(parseInt(screenTimeInput.value, 10)),
			};
			localStorage.setItem("simu-plate-settings", JSON.stringify(obj));
		} catch {
			/* ignore */
		}
	}

	// Eventos
	startBtn.addEventListener("click", () => {
		rng = createRngFromSeed(seedInput.value.trim());
		start();
	});
	stopBtn.addEventListener("click", stop);
	nextBtn.addEventListener("click", () => {
		rng = createRngFromSeed(seedInput.value.trim() || undefined);
		if (isMotionOn()) {
			if (timerId) {
				clearTimeout(timerId);
				timerId = null;
			}
			cancelMotionAnim();
			showMovingPlate();
			return;
		}
		// Avanza una fase manualmente
		if (phase === "show") {
			setHidden(true);
			phase = "blank";
		} else {
			const plate = renderRandom();
			setHidden(false);
			phase = "show";
			recordPlate(plate);
		}
		// Si está corriendo, reprogramamos desde ahora
		if (timerId) {
			clearTimeout(timerId);
			scheduleNext(clampInterval(parseInt(intervalInput.value, 10)));
		}
	});
	motionSelect.addEventListener("change", () => {
		syncMotionControls();
		saveSettings();
		if (running) {
			const keepRng = rng;
			stop();
			rng = keepRng;
			start();
		} else {
			exitMotionLayout();
			setHidden(false);
			fitTextToOverlay();
		}
	});
	screenTimeInput.addEventListener("change", saveSettings);
	chooseFileBtn.addEventListener("click", chooseLogFile);
	exportBtn.addEventListener("click", exportLog);
	window.addEventListener("resize", () => {
		if (!plateContainer.classList.contains("is-moving")) {
			fitTextToOverlay();
		}
	});
	modeSelect.addEventListener("change", () => {
		mode = modeSelect.value === "moto" ? "moto" : (modeSelect.value === "auto1994" ? "auto1994" : "auto");
		const wasMoving = plateContainer.classList.contains("is-moving");
		if (wasMoving) {
			cancelMotionAnim();
			if (timerId) {
				clearTimeout(timerId);
				timerId = null;
			}
			exitMotionLayout();
		}
		if (mode === "moto") {
			plateImg.src = "./imgs/motos-crop.png";
			plateContainer.classList.remove("plate--auto");
			plateContainer.classList.remove("plate--auto1994");
			plateContainer.classList.add("plate--moto");
			plateText.textContent = "A16\n7DUM";
		} else if (mode === "auto1994") {
			plateImg.src = "./imgs/Patente-1994.png";
			plateContainer.classList.remove("plate--moto");
			plateContainer.classList.remove("plate--auto");
			plateContainer.classList.add("plate--auto1994");
			plateText.textContent = "ABC 123";
		} else {
			plateImg.src = "./imgs/Mercosur.png";
			plateContainer.classList.remove("plate--moto");
			plateContainer.classList.remove("plate--auto1994");
			plateContainer.classList.add("plate--auto");
			plateText.textContent = "AG 759 LH";
		}
		setHidden(false);
		fitTextToOverlay();
	});
	document.addEventListener("keydown", (ev) => {
		if (ev.code === "Space") {
			ev.preventDefault();
			if (running) stop();
			else {
				rng = createRngFromSeed(seedInput.value.trim());
				start();
			}
		}
	});

	// Cuando carga la imagen, ajustamos tamaños
	plateImg.addEventListener("load", () => {
		fitTextToOverlay();
		if (running && isMotionOn() && !plateContainer.classList.contains("is-moving")) {
			showMovingPlate();
		}
	});

	// Init
	loadSettings();
	rng = createRngFromSeed(seedInput.value.trim());
	// Render inicial con ejemplo del enunciado
	plateText.textContent = "AG 759 LH";
	fitTextToOverlay();
	// Si se desea, comenzar automáticamente: descomentar
	// start();
})();

