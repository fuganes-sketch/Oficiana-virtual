# Plantilla de los agentes — LEEME

Esta carpeta (`agents.example/`) es una **copia en blanco** de las instrucciones de los 16 agentes de la oficina virtual, sin ningún dato personal. Sirve para **subir al repositorio** y para que cualquier persona arme **su propia oficina** con su negocio.

Cada archivo `.md` es la "personalidad" de un agente: lo que hace, a quién le responde y cómo trabaja. Se vuelven a leer en cada mensaje, así que si los editás el cambio se nota enseguida, sin reiniciar.

## Cómo usarla (5 pasos)

1. **Copiá la carpeta**: copiá `agents.example/` y llamala **`agents/`**. La oficina lee la carpeta `agents/`, no esta.
2. **Completá tus datos** con la tabla de abajo: buscá en `agents/` todo lo que esté entre `[CORCHETES]` y reemplazalo por lo tuyo.
3. **Cargá tu lista de precios** (si vendés servicios): ver "Precios".
4. **Cargá tu mail** para el reporte diario y los mails automáticos: ver "Tu mail".
5. **Iniciá la oficina** con `iniciar.bat` y hablá con el Director.

## Dónde poner tus datos

| Qué | Dónde |
|---|---|
| Qué es tu negocio, a qué se dedica, tu zona, tu país e impuestos | `agents/_contexto.md`, sección **"El negocio"** (arriba de todo) |
| Tu nombre | Reemplazá `[NOMBRE DEL DUEÑO]` en todos los archivos de `agents/` (en tu editor: *Reemplazar en todos los archivos*) |
| Nombre del negocio | Igual: reemplazá `[NOMBRE DEL NEGOCIO]` en todos los archivos |
| Zona y fecha de tu lista de precios | Reemplazá `[ZONA Y FECHA DE TU LISTA DE PRECIOS]` en todos los archivos |
| Logo, colores, tipografías, fotos, tono e Instagram | `agents/_marca.md` (describilo con palabras: los agentes no ven imágenes). Guardá las imágenes originales en `data/marca/` |
| País, régimen impositivo y facturación | `agents/legal.md` (los `[TU PAÍS]` y demás corchetes) |
| Tu mail (reporte diario y mails que salen solos) | `data/config.json` (ver "Tu mail"). **No va en `agents/`** |
| Tu lista de precios | `data/precios/` (ver "Precios") |
| Qué hace cada agente | Su propio archivo: `director.md`, `admin-social.md`, `admin-produccion.md`, `admin-financiero.md`, `legal.md`, `ventas.md`, `redes.md`, etc. Cambiá lo que no encaje con tu negocio |

## Precios

- La lista de precios no va en `agents/`: va en **`data/precios/precios.json`**. Es la única fuente que usa el agente de **Ventas** para armar presupuestos (el sistema calcula los totales; el agente no suma).
- Formato: copiá la estructura del `precios.json` de ejemplo (fecha, zonas y servicios con `id`, nombre y precio) y reemplazá los datos por los tuyos. Guardá también el PDF original de tu lista en `data/precios/`.
- Después reemplazá `[ZONA Y FECHA DE TU LISTA DE PRECIOS]` en los archivos de `agents/` y ajustá `ventas.md` si tu lista tiene columnas o zonas distintas.

## Tu mail

Creá el archivo **`data/config.json`** con tu casilla:

```json
{
  "reporte": { "activo": true, "hora": "08:00", "para": "tu-mail@ejemplo.com" },
  "opciones": { "mailAutomatico": true, "enviarAlAprobar": true, "maxMailsDia": 30 }
}
```

- `reporte.para`: tu mail. Ahí llegan el **reporte diario** y los mails que los agentes te mandan a vos (salen solos). Todo mail a un cliente o a un tercero pasa antes por tu aprobación en la sección **TRABAJOS**.
- `reporte.hora`: a qué hora se manda el reporte (la PC tiene que estar prendida).
- `opciones.enviarAlAprobar`: `true` = al aprobar se envía; `false` = solo se deja un borrador en tu Gmail.
- Los mails salen por el conector de Gmail de Claude: tenés que tenerlo conectado en tu cuenta.

## Qué no subir a un repo público

- La carpeta `data/` (chats, sesiones, pendientes, reportes, tu mail) está en el `.gitignore` a propósito.
- Tu carpeta `agents/` ya completa tiene datos de tu negocio. Para compartir, subí solo `agents.example/`.

## Archivos con prefijo `_`

- `_contexto.md`: lo leen **todos** los agentes (negocio, reglas generales, cómo dejar mails, publicaciones y gastos para aprobación).
- `_marca.md`: lo leen solo los agentes con `marca: si` (Diseñador, Redes, Marketing, RR.PP. y Admin. Social).
