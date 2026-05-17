'use client'

import { useState } from 'react'

export default function ParteOperativoPage() {

  const [loading, setLoading] = useState(false)

  const [form, setForm] = useState({
    pozo: '',
    yacimiento: '',
    operadora: '',
    contratista: 'KOMPASS',
    unidad_pesada: '',
    salida_desde: '',
    km: '',
    operador_1: '',
    operador_2: '',
    operador_3: ''
  })

  async function generarParte() {

    try {

      setLoading(true)

      const response = await fetch('http://localhost:3000/partes-operativos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(form)
      })

      const data = await response.json()

      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Error creando parte')
      }

      window.location.href = `/operador/partes-operativos/${data.parte.id}`

      setForm({
        pozo: '',
        yacimiento: '',
        operadora: '',
        contratista: 'KOMPASS',
        unidad_pesada: '',
        salida_desde: '',
        km: '',
        operador_1: '',
        operador_2: '',
        operador_3: ''
      })

    } catch (error: any) {

      alert(error.message)

    } finally {

      setLoading(false)

    }
  }

  return (
    <div style={{ padding: 30 }}>

      <h1>Nuevo Parte Operativo</h1>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 15,
        marginTop: 20
      }}>

        <input
          placeholder="Pozo"
          value={form.pozo}
          onChange={(e) => setForm({ ...form, pozo: e.target.value })}
        />

        <input
          placeholder="Yacimiento"
          value={form.yacimiento}
          onChange={(e) => setForm({ ...form, yacimiento: e.target.value })}
        />

        <input
          placeholder="Operadora"
          value={form.operadora}
          onChange={(e) => setForm({ ...form, operadora: e.target.value })}
        />

        <input
          placeholder="Unidad pesada"
          value={form.unidad_pesada}
          onChange={(e) => setForm({ ...form, unidad_pesada: e.target.value })}
        />

        <input
          placeholder="Salida desde"
          value={form.salida_desde}
          onChange={(e) => setForm({ ...form, salida_desde: e.target.value })}
        />

        <input
          placeholder="KM"
          value={form.km}
          onChange={(e) => setForm({ ...form, km: e.target.value })}
        />

        <input
          placeholder="Operador 1"
          value={form.operador_1}
          onChange={(e) => setForm({ ...form, operador_1: e.target.value })}
        />

        <input
          placeholder="Operador 2"
          value={form.operador_2}
          onChange={(e) => setForm({ ...form, operador_2: e.target.value })}
        />

        <input
          placeholder="Operador 3"
          value={form.operador_3}
          onChange={(e) => setForm({ ...form, operador_3: e.target.value })}
        />

      </div>

      <button
        onClick={generarParte}
        disabled={loading}
        style={{
          marginTop: 25,
          padding: '12px 20px',
          cursor: 'pointer'
        }}
      >
        {loading ? 'Generando...' : 'Generar Parte'}
      </button>

    </div>
  )
}