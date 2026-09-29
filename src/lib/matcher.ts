import stringSimilarity from 'string-similarity';
import { ExtractedItem } from './documentParsers';

export interface MatchedUpdate {
  id: string;
  name: string;
  supplierCode?: string;
  supplierName: string;
  newPrice: number;
  matchType: 'codigo' | 'similitud';
  confidence: number; // Porcentaje de 0 a 100
}

// Umbral óptimo: balance entre tolerar abreviaciones y descartar familias distintas
const SIMILARITY_THRESHOLD = 0.60;

/**
 * Normaliza textos quitando acentos, puntuación y espacios extras
 */
function cleanText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Quita tildes
    .replace(/[^a-z0-9\s]/g, ' ')   // Quita símbolos especiales
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchItemsWithCatalog(
  extractedItems: ExtractedItem[],
  myProducts: any[],
  selectedDistributorId: string
): MatchedUpdate[] {
  const updates: MatchedUpdate[] = [];

  // Registros para evitar que un ítem o producto se asocie dos veces
  const matchedProductIds = new Set<string>();
  const matchedItemIndices = new Set<number>();

  // =========================================================================
  // FASE 1: Coincidencia Exacta por Código del Proveedor (Prioridad 100%)
  // =========================================================================
  extractedItems.forEach((item, itemIdx) => {
    if (!item.rawCode) return;

    const exactMatch = myProducts.find(
      (p) => p.providerCodes?.[selectedDistributorId] === item.rawCode
    );

    if (exactMatch && !matchedProductIds.has(exactMatch.id)) {
      matchedProductIds.add(exactMatch.id);
      matchedItemIndices.add(itemIdx);

      updates.push({
        id: exactMatch.id,
        name: exactMatch.name,
        supplierCode: item.rawCode,
        supplierName: item.rawName,
        newPrice: item.rawPrice,
        matchType: 'codigo',
        confidence: 100,
      });
    }
  });

  // =========================================================================
  // FASE 2: Recolección de Candidatos por Similitud de Texto (Fuzzy Matching)
  // =========================================================================
  interface CandidateMatch {
    itemIdx: number;
    product: any;
    score: number;
  }

  const candidates: CandidateMatch[] = [];

  // Productos del catálogo que aún no fueron asociados en la Fase 1
  const availableProducts = myProducts.filter((p) => !matchedProductIds.has(p.id));

  extractedItems.forEach((item, itemIdx) => {
    // Si ya se vinculó por código en la Fase 1, se salta
    if (matchedItemIndices.has(itemIdx)) return;

    const cleanRaw = cleanText(item.rawName);
    if (cleanRaw.length < 3) return;

    for (const prod of availableProducts) {
      const cleanProd = cleanText(prod.name);
      const score = stringSimilarity.compareTwoStrings(cleanRaw, cleanProd);

      // Solo califica si supera el umbral mínimo
      if (score >= SIMILARITY_THRESHOLD) {
        candidates.push({
          itemIdx,
          product: prod,
          score,
        });
      }
    }
  });

  // =========================================================================
  // FASE 3: Asignación por Mayor Puntuación (El score más alto gana)
  // =========================================================================
  // Ordenamos de mayor a menor puntuación (1.0 -> 0.60)
  candidates.sort((a, b) => b.score - a.score);

  for (const cand of candidates) {
    // Si el producto del catálogo ya fue ganado por un candidato con mayor score, continuar
    if (matchedProductIds.has(cand.product.id)) continue;

    // Si el ítem del PDF ya fue asignado a otro producto con mayor score, continuar
    if (matchedItemIndices.has(cand.itemIdx)) continue;

    const item = extractedItems[cand.itemIdx];

    matchedProductIds.add(cand.product.id);
    matchedItemIndices.add(cand.itemIdx);

    updates.push({
      id: cand.product.id,
      name: cand.product.name,
      supplierCode: item.rawCode,
      supplierName: item.rawName,
      newPrice: item.rawPrice,
      matchType: 'similitud',
      confidence: Math.round(cand.score * 100),
    });
  }

  return updates;
}