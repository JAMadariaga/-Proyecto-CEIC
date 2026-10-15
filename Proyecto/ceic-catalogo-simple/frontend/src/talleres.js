// Los ids deben coincidir con los del servidor (TALLERES en server.js)
export const TALLERES = ['lavado-autos', 'reposteria', 'mantencion', 'teteria']

export const NOMBRES_TALLER = {
  'lavado-autos': 'Lavado de autos',
  reposteria: 'Repostería',
  mantencion: 'Mantención y reparaciones',
  teteria: 'Tetería'
}

export const ICONOS_TALLER = {
  'lavado-autos': '🚗',
  reposteria: '🧁',
  mantencion: '🔧',
  teteria: '☕'
}

export const iconoTaller = (name) => {
  const key = Object.keys(NOMBRES_TALLER).find((slug) => NOMBRES_TALLER[slug] === name)
  return ICONOS_TALLER[key] || '✦'
}

export const formatPrecio = (price) => `$${Number(price).toLocaleString('es-CL')}`