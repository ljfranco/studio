import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import { createWorker } from 'tesseract.js';

export interface ExtractedItem {
  rawName: string;
  rawPrice: number;
  rawCode?: string;
}

export interface PdfColumnHeader {
  index: number;
  label: string;
  xStart: number;
  xEnd: number;
}

export interface CandidateRow {
  rowIndex: number;
  y: number;
  displayText: string;
  items: Array<{ x: number; text: string; width: number }>;
}

export async function getPdfCandidateRows(file: File, maxRows: number = 8): Promise<CandidateRow[]> {
  const pdfjsLib = await import('pdfjs-dist/build/pdf.mjs');
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const firstPage = await pdf.getPage(1);
  const content = await firstPage.getTextContent();

  // 1. Agrupar ítems por coordenada Y (tolerancia elástica de 4px)
  const rowsByY: Record<number, Array<{ x: number; text: string; width: number }>> = {};
  for (const item of content.items as any[]) {
    const text = item.str.trim();
    if (!text) continue;

    const y = Math.round(item.transform[5] / 4) * 4;
    const x = item.transform[4];
    const width = item.width || 0;

    if (!rowsByY[y]) rowsByY[y] = [];
    rowsByY[y].push({ x, text, width });
  }

  // 2. Ordenar de arriba a abajo
  const sortedY = Object.keys(rowsByY).sort((a, b) => Number(b) - Number(a));

  // 3. Tomar las primeras N filas que tengan al menos 2 elementos
  const candidates: CandidateRow[] = [];
  for (const y of sortedY) {
    const rowItems = rowsByY[Number(y)].sort((a, b) => a.x - b.x);
    if (rowItems.length < 2) continue; // Descarta títulos aislados de una sola palabra

    candidates.push({
      rowIndex: candidates.length,
      y: Number(y),
      displayText: rowItems.map(i => i.text).join(' | '),
      items: rowItems
    });

    if (candidates.length >= maxRows) break;
  }

  return candidates;
}

/**
 * Convierte la fila elegida por el usuario en el formato PdfColumnHeader[] requerido por el parser
 */
export function buildHeadersFromSelectedRow(selectedItems: Array<{ x: number; text: string; width: number }>): PdfColumnHeader[] {
  const headers: PdfColumnHeader[] = [];
  let currentLabel = '';
  let startX = -1;
  let lastRight = -1;

  for (const item of selectedItems) {
    // Si la distancia horizontal es menor a 6px, pertenece a la misma columna (ej. "Tarifa" + "1+IVA")
    if (lastRight !== -1 && item.x - lastRight < 6) {
      currentLabel += ' ' + item.text;
      lastRight = item.x + item.width;
    } else {
      if (currentLabel) {
        headers.push({
          index: headers.length,
          label: currentLabel.trim(),
          xStart: startX,
          xEnd: lastRight,
        });
      }
      currentLabel = item.text;
      startX = item.x;
      lastRight = item.x + item.width;
    }
  }

  if (currentLabel) {
    headers.push({
      index: headers.length,
      label: currentLabel.trim(),
      xStart: startX,
      xEnd: lastRight,
    });
  }

  return headers;
}
export async function extractPdfHeaders(file: File): Promise<PdfColumnHeader[]> {
  const pdfjsLib = await import('pdfjs-dist/build/pdf.mjs');
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const firstPage = await pdf.getPage(1);
  const content = await firstPage.getTextContent();

  // 1. Agrupar piezas de texto por coordenada vertical Y (tolerancia de 4px)
  const rowsByY: Record<number, Array<{ x: number; text: string; width: number }>> = {};
  for (const item of content.items as any[]) {
    const text = item.str.trim();
    if (!text) continue;

    const y = Math.round(item.transform[5] / 4) * 4;
    const x = item.transform[4];
    const width = item.width || 0;

    if (!rowsByY[y]) rowsByY[y] = [];
    rowsByY[y].push({ x, text, width });
  }

  // 2. Ordenar renglones de arriba hacia abajo
  const sortedY = Object.keys(rowsByY).sort((a, b) => Number(b) - Number(a));

  // 3. Buscar la fila del cabezal (la primera línea que tenga aspecto de tabla)
  let selectedRow: Array<{ x: number; text: string; width: number }> | null = null;

  for (const y of sortedY) {
    const row = rowsByY[Number(y)].sort((a, b) => a.x - b.x);

    // Contar bloques separados horizontalmente (umbral de 8px)
    let columnCount = 0;
    let lastX = -1;
    for (const item of row) {
      if (lastX === -1 || item.x - lastX > 8) {
        columnCount++;
      }
      lastX = item.x + item.width;
    }

    if (columnCount >= 3) {
      selectedRow = row;
      break;
    }
  }

  if (!selectedRow) return [];

  // 4. UNIFICACIÓN ESTRICTA: Solo unimos si están prácticamente pegados (< 5px)
  // De esta forma 'ANTERIOR' y 'ARTICULO' quedan en columnas separadas.
  const headers: PdfColumnHeader[] = [];
  let currentLabel = '';
  let startX = -1;
  let lastRight = -1;

  for (const item of selectedRow) {
    // Umbral reducido a 6px para no fusionar columnas vecinas
    if (lastRight !== -1 && item.x - lastRight < 6) {
      currentLabel += ' ' + item.text;
      lastRight = item.x + item.width;
    } else {
      if (currentLabel) {
        headers.push({
          index: headers.length,
          label: currentLabel.trim(),
          xStart: startX,
          xEnd: lastRight,
        });
      }
      currentLabel = item.text;
      startX = item.x;
      lastRight = item.x + item.width;
    }
  }

  if (currentLabel) {
    headers.push({
      index: headers.length,
      label: currentLabel.trim(),
      xStart: startX,
      xEnd: lastRight,
    });
  }

  return headers.map((h, i) => ({
    ...h,
    label: h.label.length > 0 && h.label !== '$' ? h.label : `Columna ${i + 1}`,
  }));
}

export async function parsePriceListImage(imageFile: File) {
  const worker = await createWorker('spa');
  const ret: any = await worker.recognize(imageFile);
  await worker.terminate();

  const data = ret.data;

  // Accedemos a lines o words sin que TypeScript bloquee la compilación
  const lines = (data.lines || []).map((line: any) => ({
    text: line.text.trim(),
    y: line.bbox ? line.bbox.y0 : 0,
    confidence: line.confidence || 0,
  }));

  return lines;
}

// 1. Limpieza básica de strings de precio ("$ 1.250,50" -> 1250.50)
export function parsePrice(val: any): number | null {
  if (val === null || val === undefined) return null;

  // Si ya viene como número (ej. desde una celda numérica de Excel)
  if (typeof val === 'number') {
    // Si necesitas validar también en números que tengan decimales o redondear:
    return Number(val.toFixed(2));
  }

  const strVal = val.toString().trim();

  // EXPRESIÓN REGULAR CLAVE:
  // Busca que contenga dígitos, un punto o coma separador, y EXACTAMENTE 2 dígitos al final.
  // Permite opcionalmente separadores de miles y el signo '$'.
  const strictPriceRegex = /^(?:\$\s*)?\d{1,3}(?:[.,]\d{3})*[,.]\d{2}$|^\d+[,.]\d{2}$/;

  // Limpieza inicial quitando espacios entre '$' y el número
  const cleanedText = strVal.replace(/\s+/g, '');

  if (!strictPriceRegex.test(cleanedText)) {
    return null; // Si no tiene exactamente 2 decimales tras '.' o ',', se descarta
  }

  // Extraer únicamente los caracteres numéricos y separadores
  const rawNumber = cleanedText.replace(/[^0-9.,]/g, '');

  // Formato tipo 1.250,50 (Punto miles, Coma decimal)
  if (rawNumber.includes('.') && rawNumber.includes(',')) {
    if (rawNumber.lastIndexOf(',') > rawNumber.lastIndexOf('.')) {
      return parseFloat(rawNumber.replace(/\./g, '').replace(',', '.'));
    } else {
      // Formato tipo 1,250.50 (Coma miles, Punto decimal)
      return parseFloat(rawNumber.replace(/,/g, ''));
    }
  }

  // Si solo tiene coma como separador decimal (ej: 64,90)
  if (rawNumber.includes(',')) {
    return parseFloat(rawNumber.replace(',', '.'));
  }

  // Si solo tiene punto decimal (ej: 64.90)
  return parseFloat(rawNumber);
}

// 2. PARSER PARA EXCEL (.xlsx, .xls, .csv)
export async function parseExcel(file: File): Promise<ExtractedItem[]> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  // Convertimos a array de filas con array de celdas para no depender de nombres de columnas
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  
  const results: ExtractedItem[] = [];

  for (const row of rows) {
    if (!row || row.length === 0) continue;

    // Buscamos cuál celda parece precio y cuál texto descriptivo
    let foundPrice: number | null = null;
    let foundText = '';
    let foundCode = '';

    for (const cell of row) {
      if (cell === null || cell === undefined) continue;
      const num = parsePrice(cell);
      
      // Si la celda es numérica/precio válido y no es un año o código corto
      if (num !== null && !isNaN(num) && typeof cell !== 'string' && num > 0) {
        foundPrice = num;
      } else if (typeof cell === 'string') {
        const textTrimmed = cell.trim();
        // Si parece un precio con símbolo ("$ 450")
        const parsedPriceFromText = parsePrice(textTrimmed);
        if (textTrimmed.startsWith('$') && parsedPriceFromText !== null) {
          foundPrice = parsedPriceFromText;
        } else if (textTrimmed.length > foundText.length) {
          // Tomamos la cadena más larga de la fila como la descripción/nombre
          foundText = textTrimmed;
        } else if (/^[A-Z0-9_-]{3,10}$/i.test(textTrimmed) && !foundCode) {
          foundCode = textTrimmed;
        }
      }
    }

    if (foundText.length > 2 && foundPrice !== null && foundPrice > 0) {
      results.push({
        rawName: foundText,
        rawPrice: foundPrice,
        rawCode: foundCode || undefined
      });
    }
  }

  return results;
}

// 3. PARSER PARA WORD (.docx)
export async function parseWord(file: File): Promise<ExtractedItem[]> {
  const arrayBuffer = await file.arrayBuffer();
  const { value: rawText } = await mammoth.extractRawText({ arrayBuffer });
  
  const lines = rawText.split('\n');
  const results: ExtractedItem[] = [];

  // Expresión regular para capturar filas tipo "Nombre del producto ... $120.50" o "Nombre ... 120.50"
  const lineRegex = /^(.*?)(?:\s+[\$]?\s*)(\d+(?:[.,]\d{1,2})?)\s*$/;

  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(lineRegex);
    if (match) {
      const name = match[1].replace(/[-.:_]+$/, '').trim();
      const price = parsePrice(match[2]);
      if (name.length > 2 && price !== null) {
        results.push({ rawName: name, rawPrice: price });
      }
    }
  }
  return results;
}

export async function parsePdfWithMapping(
  file: File,
  headers: PdfColumnHeader[],
  mapping: { codeIndex: number; nameIndex: number; priceIndex: number }
): Promise<ExtractedItem[]> {
  const pdfjsLib = await import('pdfjs-dist/build/pdf.mjs');
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const results: ExtractedItem[] = [];

  // 1. Descarte dinámico: Colección de nombres de columnas leídos en mayúsculas
  const headerLabels = new Set(
    headers.map(h => h.label.trim().toUpperCase())
  );

  // Ordenamos los encabezados por su posición X para delimitar sus rangos visuales
  const sortedHeaders = [...headers].sort((a, b) => a.xStart - b.xStart);

  // Precalculamos las fronteras (boundaries) entre columnas contiguas
  const boundaries = sortedHeaders.map((h, i) => {
    const prev = sortedHeaders[i - 1];
    const next = sortedHeaders[i + 1];

    // Límite izquierdo: punto medio con la columna anterior o 0
    const left = prev ? (prev.xEnd + h.xStart) / 2 : 0;
    // Límite derecho: punto medio con la columna siguiente o el infinito
    const right = next ? (h.xEnd + next.xStart) / 2 : 99999;

    return { index: h.index, left, right, label: h.label };
  });

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    // 1. Agrupar piezas de texto por renglón Y (tolerancia elástica de 5px)
    const rawItems: Array<{ x: number; y: number; text: string }> = [];
    for (const item of content.items as any[]) {
      const text = item.str.trim();
      if (!text) continue;
      rawItems.push({
        x: item.transform[4],
        y: item.transform[5],
        text
      });
    }

    // Ordenar de arriba hacia abajo
    rawItems.sort((a, b) => b.y - a.y);

    const rows: Array<Array<{ x: number; text: string }>> = [];
    for (const item of rawItems) {
      const match = rows.find(r => Math.abs((r as any).y - item.y) <= 5);
      if (match) {
        match.push(item);
      } else {
        const newRow: any = [item];
        newRow.y = item.y;
        rows.push(newRow);
      }
    }

    // 2. Procesar cada renglón
    for (const row of rows) {
      row.sort((a, b) => a.x - b.x);

      const rowData: Record<number, string[]> = {};

      for (const item of row) {
        // Encontrar a qué columna pertenece según los límites horizontales
        const col = boundaries.find(b => item.x >= b.left && item.x < b.right);
        if (col) {
          if (!rowData[col.index]) rowData[col.index] = [];
          rowData[col.index].push(item.text);
        }
      }

      // Reconstruir textos de las columnas seleccionadas
      const rawPriceStr = (rowData[mapping.priceIndex] || []).join(' ').trim();
      const rawName = (rowData[mapping.nameIndex] || []).join(' ').trim();

      // Validación de longitud mínima
      if (!rawName || rawName.length < 2) continue;

      // 2. Filtro dinámico: Omitir la fila si coincide con algún header del documento
      const cleanUpperName = rawName.toUpperCase();
      if (headerLabels.has(cleanUpperName)) continue;

      // 3. Extracción de código limpia: Solo el primer token antes del espacio
      let rawCode: string | undefined = undefined;
      if (mapping.codeIndex !== -1) {
        const fullCodeStr = (rowData[mapping.codeIndex] || []).join(' ').trim();
        if (fullCodeStr) {
          rawCode = fullCodeStr.split(/\s+/)[0].trim();
        }
      }

      const parsedPrice = parsePrice(rawPriceStr);

      if (parsedPrice !== null && !isNaN(parsedPrice) && parsedPrice > 0) {
        results.push({
          rawCode: rawCode || undefined,
          rawName,
          rawPrice: parsedPrice
        });
      }
    }
  }

  console.log(`[parsePdfWithMapping] Filas extraídas con éxito: ${results.length}`);
  return results;
}