# NORVA

[Português](../README.md) · [English](README.en.md) · **Español**

Sistema de gestión para quien **fabrica y distribuye**: de la receta al costo
real, de la producción al lote, de la cámara fría a la tienda, y de lo que salió
a la ganancia que debería haber vuelto.

Nace en una fábrica de paletas y helados, pero nada del helado está fijo en el
código — la jerarquía de empaque, los módulos y los roles son configurables,
porque el producto se publicará en las tiendas de Android y Apple.

> **Estado: Fase 1 — qué produces y cuánto cuesta.** Sobre el cimiento de la
> fase 0 (libro mayor, multiempresa, permisos por capacidad, sistema de diseño,
> i18n) ya funcionan las pantallas de insumo, receta, producto y factura de
> compra, con el costo recalculando mientras se escribe. Producción, lote y
> distribución vienen después.

---

## El vacío que ocupa

Una investigación en cinco mercados (Brasil, Latinoamérica hispana, el mundo
anglófono, Italia e India) encontró siempre la misma división:

| Región | Resuelve bien | Ignora |
|---|---|---|
| 🇧🇷 Brasil | POS de tienda **o** ERP industrial pesado | El fabricante pequeño que distribuye |
| 🇦🇷🇨🇱🇲🇽🇨🇴 LATAM | POS de gastronomía | La producción como industria |
| 🇺🇸🇬🇧 Anglófono | Costo de receta, trazabilidad | Móvil, precio accesible |
| 🇮🇹 Italia | Balanceo técnico (PAC/POD) | Inventario, distribución, dinero |
| 🇮🇳 India | Distribución, cadena de frío | Escala pequeña, simplicidad |

Cada región resuelve una parte. **Nadie las junta.** Y la queja número uno del
sector no es una función faltante: es la **implantación y el soporte**. Por eso
el asistente de inicio, que la persona completa sola y sin consultor, se trata
aquí como capacidad principal y no como detalle.

---

## Los nueve cimientos

Ninguno se puede agregar después.

**F1 · Libro mayor inmutable.** No existe una columna `stock_actual`. El saldo
es la suma de una lista de movimientos que solo crece. Eso entrega gratis:
historial, auditoría, corrección por reverso en lugar de borrado, reportes que
no pueden contradecir el historial, y sincronización sin conflictos. La
inmutabilidad la impone un *trigger de base de datos*, no una convención.

**F2 · Costo congelado.** Cada movimiento guarda el costo de ese instante.
Cambiar el precio del azúcar en marzo no puede reescribir el margen de enero.

**F3 · Offline primero.** Una cámara fría es una caja de metal y una ruta de
reparto no tiene señal. El id se genera en el dispositivo, así que reenviar la
cola dos veces es inofensivo.

**F4 · Multiempresa desde la primera línea.** `company_id` en cada tabla,
aislamiento por RLS en el servidor.

**F5 · Módulos con interruptor.** Un módulo apagado es **invisible**, nunca
gris: un campo bloqueado se lee como un cobro encubierto. Apagar nunca borra
datos.

**F6 · Permiso por capacidad, nunca por pantalla.** Un rol es un paquete de
capacidades. Esconder un botón es decoración, no seguridad.

**F7 · "Depende" se vuelve dato.** Cada tienda y cliente lleva una ficha de
acuerdo (lista de precios, días de entrega, aprobación, crédito, política de
devolución). El sistema no tiene *el* flujo: tiene el flujo de ese cliente.

**F8 · Recolecte la señal ya, active la inteligencia después.** La temperatura
diaria y las coordenadas se guardan desde el día uno aunque no se usen: el
historial no se crea retroactivamente.

**F9 · Dinero en centavos enteros.** Nunca un decimal flotante.

---

## El asistente

El dueño de la fábrica no debería tener que aprender a navegar: pregunta. El
modo conversación es otra puerta a la misma casa: mismos datos, mismos permisos,
mismas acciones.

Tres reglas lo mantienen confiable, y las tres están cubiertas por pruebas:

1. **Nunca produce un número.** La frase elige la consulta, el motor
   determinista calcula, y la respuesta se arma alrededor de lo que el motor
   devolvió. Cuando entre el modelo de lenguaje, mapeará la pregunta a una
   habilidad y sus campos, nada más. Intérprete, nunca contador.
2. **Nunca escribe en el libro mayor.** Una frase que registraría algo llena una
   ficha en lenguaje natural y espera un sí humano. Si entendió mal, se ve antes
   de guardar, no meses después en un informe.
3. **El permiso se aplica en la consulta, no en una instrucción al modelo.** Un
   modelo al que se le pide guardar un secreto termina contándolo; una consulta
   que nunca devolvió la cifra no tiene nada que filtrar.

También funciona sin conexión, porque reconocer las preguntas que se repiten es
aritmética sobre texto, y una cámara fría no tiene señal.

## Diseño

**El color es acento, nunca superficie.** Ocho ambientes pastel (uno por área)
dicen *dónde está*; cuatro señales saturadas dicen *qué está pasando*. Las dos
familias nunca se mezclan, separadas por saturación y función. El color del área
aparece en exactamente cuatro lugares: el filete de 3 px de la tarjeta, el icono
superior, el botón principal y el trazo de un gráfico.

**La vida viene del movimiento.** Nada parpadea; los pulsos corren entre 2,6 y
3,2 s. Como máximo dos elementos animados por pantalla. Solo pulsa lo que está
vivo de verdad: un pulso junto a un número quieto es una mentira visual.
`prefers-reduced-motion` lo apaga todo y la pantalla sigue completa.

**La accesibilidad cognitiva pesa más que la estética.** Nunca un icono solo ·
una acción principal por pantalla, con verbo · confirmación escrita completa ·
**el color nunca viaja solo, siempre con la palabra** · cuerpo de 17 pt, un paso
por encima del estándar, porque esto se lee en una nave con mala luz.

**Tipografía: IBM Plex Sans + IBM Plex Mono.** Elección técnica, no estética:
cifras tabulares (si no, la columna de valores baila en cada actualización) y
una monoespaciada hermana en la que `0` y `O`, `1` y `l` no se confunden.
Alguien va a teclear códigos de lote con guantes, con frío y con la etiqueta
mojada.

---

## Ejecución

```bash
npm install
npx expo start
```

Verificación:

```bash
npm run typecheck   # tipos
npm test            # el motor de costo, incluida la cadena factura → receta → producto
npm run db:verify   # levanta un Postgres descartable y prueba lo que el esquema promete
```

---

## Estructura

```
app/                    rutas (Expo Router)
src/config/brand.ts     nombre, marca y deep link - punto único
src/theme/              tokens y proveedor de tema
src/domain/             libro mayor, dinero, receta, costo promedio, empaque
src/data/               SQLite local y el camino único de consulta
src/assistant/          habilidades, permisos y la ficha de confirmación
src/components/         Card, Chip, Button, UnitStepper, PulseDot, CountUp…
src/i18n/               pt-BR · es · en, con moneda y fecha por locale
supabase/migrations/    esquema versionado (no aplicado a ningún proyecto)
```

El nombre de la marca vive solo en `src/config/brand.ts` y en `app.json`.
Cambiar de marca es editar un archivo, no refactorizar — decisión deliberada
mientras la búsqueda de marca en el INPI sigue pendiente.

---

## Lo que falta y necesita a una persona

- **Registro formal de la marca en el INPI.** La búsqueda previa salió verde
  para Brasil; el depósito sigue siendo acto del titular. La consulta no es
  automatizable: el INPI exige login gov.br y la base de la WIPO tiene CAPTCHA.
- **Proyecto Supabase.** Las migraciones están listas; aplicarlas requiere una
  cuenta.
- **Cuenta Expo/EAS** para compilaciones y actualizaciones OTA.
- **Dominio.**

---

## Licencia

Propietario. Todos los derechos reservados.
