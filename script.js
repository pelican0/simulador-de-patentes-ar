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
	const intervalInput = $("#intervalInput");
	const seedInput = $("#seedInput");
	const modeSelect = $("#modeSelect");
	const startBtn = $("#startBtn");
	const stopBtn = $("#stopBtn");
	const nextBtn = $("#nextBtn");
	const logToggle = $("#logToggle");
	const chooseFileBtn = $("#chooseFileBtn");
	const exportBtn = $("#exportBtn");
	const fileNameEl = $("#fileName");

	let timerId = null;
	let phase = "show"; // "show" | "blank"
	let rng = createRngFromSeed("");
	let lastPlate = "AG123CD";
	let logEntries = [];
	let logFileHandle = null; // FileSystemFileHandle (solo sesión actual)
	let mode = "auto"; // "auto" | "moto"

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
		const ms = clampInterval(parseInt(intervalInput.value, 10));
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
		if (timerId) {
			clearInterval(timerId);
		}
		// Comenzamos mostrando y luego vendrá el blanco
		phase = "show";
		const plate = renderRandom();
		setHidden(false);
		recordPlate(plate);
		scheduleNext(ms);
	}

	function stop() {
		if (timerId) {
			clearTimeout(timerId);
			timerId = null;
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
		} catch {
			/* ignore */
		}
	}
	function saveSettings() {
		try {
			const obj = {
				interval: clampInterval(parseInt(intervalInput.value, 10)),
				seed: seedInput.value || "",
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
	chooseFileBtn.addEventListener("click", chooseLogFile);
	exportBtn.addEventListener("click", exportLog);
	window.addEventListener("resize", fitTextToOverlay);
	modeSelect.addEventListener("change", () => {
		mode = modeSelect.value === "moto" ? "moto" : "auto";
		const plateContainer = document.getElementById("plateContainer");
		if (mode === "moto") {
			plateImg.src = "./imgs/motos-crop.png";
			plateContainer.classList.remove("plate--auto");
			plateContainer.classList.add("plate--moto");
			plateText.textContent = "A16\n7DUM";
		} else {
			plateImg.src = "./imgs/Mercosur.png";
			plateContainer.classList.remove("plate--moto");
			plateContainer.classList.add("plate--auto");
			plateText.textContent = "AG 759 LH";
		}
		setHidden(false);
		fitTextToOverlay();
	});
	document.addEventListener("keydown", (ev) => {
		if (ev.code === "Space") {
			ev.preventDefault();
			if (timerId) stop();
			else {
				rng = createRngFromSeed(seedInput.value.trim());
				start();
			}
		}
	});

	// Cuando carga la imagen, ajustamos tamaños
	plateImg.addEventListener("load", () => {
		fitTextToOverlay();
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

