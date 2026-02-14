# Simulador de Patentes (Mercosur - Argentina)

Aplicación simple en HTML/CSS/JS que superpone cadenas aleatorias con formato `AB123CD` sobre la plantilla oficial de la chapa Mercosur de Argentina (`imgs/Mercosur.png`).

## Uso

1. Asegurate de tener el archivo de plantilla en `imgs/Mercosur.png` (ya incluido).
2. Abrí `index.html` con tu navegador (doble clic).
3. Controles:
   - Intervalo (ms): tiempo entre cambios automáticos.
   - Semilla: si ingresás una palabra, la secuencia aleatoria será reproducible.
   - Iniciar / Detener: comienza o pausa la rotación.
   - Siguiente: genera una sola patente.
   - Atajo: barra espaciadora inicia/detiene.

## Registro en archivo (log)

Cada vez que se muestra una patente (fase “visible”) se registra una línea con fecha y la patente en formato `YYYY-MM-DD HH:mm:ss - AB123CD`.

- Botón **Registrar**: activa/desactiva el registro automático.
- **Elegir archivo…**: si tu navegador lo permite (Chromium/Edge/Chrome en `http://localhost` o `https://`), podrás seleccionar/crear un `.txt` y la app irá agregando líneas allí automáticamente.
- **Exportar .txt**: si no puedes elegir archivo, este botón descarga un `.txt` con todo lo registrado en la sesión actual.

Nota: Para poder elegir archivo en Chrome/Edge abre la app sirviéndola desde un servidor local (por ejemplo con `npx serve .`) o publícala con HTTPS. Abrir directo con `file://` puede no habilitar la API de archivos.

## Ajustes finos de posición

Si tu imagen tiene proporciones distintas, podés ajustar variables CSS en `styles.css`:

```css
:root {
  --overlay-top: 34%;
  --overlay-bottom: 14%;
  --overlay-left: 7%;
  --overlay-right: 7%;
  --group-gap-em: 0.55em; /* espacio entre "AB 123 CD" */
}
```

La altura del texto se ajusta automáticamente al alto del área de overlay.

## Notas

- El generador excluye las letras `I`, `O` y `Q` para evitar confusiones visuales.
- El formato visual mostrado es `"AB 123 CD"`, pero internamente la cadena es `"AB123CD"`.
- Configuración (intervalo y semilla) se guarda en `localStorage`.

