export type StockState = 'sin_stock' | 'stock_bajo' | 'ok'

export function stockState(consumible: {
  cantidad?: number | null
  stock_minimo?: number | null
}): StockState {
  const cantidad = Number(consumible.cantidad || 0)
  const minimo = Number(consumible.stock_minimo || 0)

  if (cantidad <= 0) return 'sin_stock'
  if (cantidad <= minimo) return 'stock_bajo'
  return 'ok'
}

export function stockLabel(state: StockState) {
  switch (state) {
    case 'sin_stock':
      return 'Sin stock'
    case 'stock_bajo':
      return 'Stock bajo'
    case 'ok':
      return 'Stock OK'
  }
}

