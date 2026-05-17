'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

export default function ParteOperativoDetallePage() {
  const params = useParams()
  const id = params.id as string

  const [loading, setLoading] = useState(true)
  const [parte, setParte] = useState<any>(null)
  const [observaciones, setObservaciones] = useState('')

  useEffect(() => {
    if (id) {
      cargarParte()
    }
  }, [id])

  async function cargarParte() {
    try {
      const response = await fetch(
        `http://localhost:3000/partes-operativos/${id}`
      )

      const data = await response.json()

      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Error obteniendo parte')
      }

      setParte(data.parte)
      setObservaciones(data.parte.observaciones || '')
    } catch (error: any) {
      alert(error.message)
    } finally {
      setLoading(false)
    }
  }

  async function guardarObservaciones() {
    try {
      const response = await fetch(
        `http://localhost:3000/partes-operativos/${id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            observaciones,
          }),
        }
      )

      const data = await response.json()

      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Error guardando')
      }

      window.location.href = `/operador/partes-operativos/${id}/servicios`
    } catch (error: any) {
      alert(error.message)
    }
  }

  if (loading) {
    return <div style={{ padding: 30 }}>Cargando...</div>
  }

  if (!parte) {
    return <div style={{ padding: 30 }}>Parte no encontrado</div>
  }

  return (
    <div style={{ padding: 30 }}>
      <h1>Parte Operativo N° {parte.numero_parte}</h1>

      <div style={{ marginTop: 20 }}>
        <p><strong>Pozo:</strong> {parte.pozo}</p>
        <p><strong>Yacimiento:</strong> {parte.yacimiento}</p>
        <p><strong>Operadora:</strong> {parte.operadora}</p>
        <p><strong>Estado:</strong> {parte.estado}</p>
      </div>

      <div style={{ marginTop: 30 }}>
        <h2>Observaciones</h2>

        <textarea
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          rows={10}
          style={{
            width: '100%',
            padding: 15,
          }}
        />
      </div>

      <button
        onClick={guardarObservaciones}
        style={{
          marginTop: 20,
          padding: '12px 20px',
          cursor: 'pointer',
        }}
      >
        Guardar Observaciones
      </button>
    </div>
  )
}