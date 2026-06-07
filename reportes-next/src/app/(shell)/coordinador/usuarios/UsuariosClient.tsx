'use client'

import * as React from 'react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { InlineMessage } from '@/components/ui/InlineMessage'
import { Modal } from '@/components/ui/Modal'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { useToast } from '@/components/ui/Toast'
import { PageHeader } from '@/components/ui/PageHeader'
import { UsuarioRowActions } from '@/app/(shell)/coordinador/usuarios/UsuarioRowActions'
import { readAppUsuario, type AppUsuario } from '@/lib/auth'
import { ApiError, del, get, post, put } from '@/lib/api'
import { cn } from '@/lib/cn'
import {
  COORD_BTN_DANGER,
  COORD_BTN_PRIMARY,
  COORD_BTN_SECONDARY,
  COORD_CHECKBOX,
  COORD_INPUT,
  COORD_LABEL,
  COORD_MODAL,
  COORD_MODAL_FOOTER,
  COORD_MODAL_HEADER,
  COORD_PANEL,
  COORD_READONLY,
} from '@/lib/coordinador/theme'
import { formatDateTimeEsAr } from '@/lib/date'
import type {
  CreateUsuarioAppBody,
  EliminarUsuariosAppBody,
  EliminarUsuariosAppResponse,
  GetUsuariosAppResponse,
  RestablecerPasswordBody,
  RestablecerPasswordResponse,
  UpdateUsuarioAppBody,
  UsuarioApp,
  UsuarioAppMutationResponse,
  UsuarioAppRol,
} from '@/lib/types/usuarios'

const ROL_OPTIONS: { value: UsuarioAppRol; label: string }[] = [
  { value: 'operador', label: 'Operador' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'coordinador', label: 'Coordinador' },
  { value: 'admin', label: 'Admin' },
]

const ADMIN_USUARIO = 'admin'

const MODAL_CLASS = COORD_MODAL
const MODAL_HEADER_CLASS = COORD_MODAL_HEADER
const MODAL_FOOTER_CLASS = COORD_MODAL_FOOTER
const LABEL_CLASS = COORD_LABEL
const INPUT_CLASS = `${COORD_INPUT} mt-1`
const READONLY_CLASS = COORD_READONLY
const PASSWORD_INPUT_CLASS =
  'mt-1 h-9 rounded-lg border-white/10 bg-white/5 text-sm text-white placeholder:text-sky-200/35 focus:border-sky-400/40 focus:ring-2 focus:ring-sky-400/10'
const FORM_GRID = 'grid grid-cols-1 gap-3 sm:grid-cols-2'
const BTN_PRIMARY = COORD_BTN_PRIMARY
const BTN_SECONDARY = COORD_BTN_SECONDARY
const BTN_DANGER = COORD_BTN_DANGER
const CHECKBOX_CLASS = COORD_CHECKBOX

type FormState = {
  nombre: string
  usuario: string
  email: string
  password: string
  rol: UsuarioAppRol
  activo: boolean
}

type DeleteConfirmState =
  | { open: false }
  | { open: true; mode: 'single'; user: UsuarioApp }
  | { open: true; mode: 'bulk'; count: number; ids: string[] }

type PasswordModalState =
  | { open: false }
  | { open: true; password: string; userName: string; usuario: string }

const EMPTY_FORM: FormState = {
  nombre: '',
  usuario: '',
  email: '',
  password: '',
  rol: 'operador',
  activo: true,
}

function resetFormState(): FormState {
  return { ...EMPTY_FORM }
}

function normalizeEmailForApi(email: string): string {
  return email.trim()
}

function isValidEmailFormat(email: string): boolean {
  if (!email.trim()) return true
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

function validateUsuarioForm(form: FormState): string | null {
  if (!form.nombre.trim()) return 'El nombre es obligatorio.'
  if (!form.usuario.trim()) return 'El usuario es obligatorio.'
  const email = normalizeEmailForApi(form.email)
  if (email && !isValidEmailFormat(email)) return 'El formato del email no es válido.'
  return null
}

function formatEmailCell(email: string | null | undefined) {
  if (email && String(email).trim()) {
    return <span className="text-sky-100">{email}</span>
  }
  return (
    <span className="inline-flex items-center gap-1 text-amber-200/90">
      <span aria-hidden>⚠</span>
      <span>Sin correo</span>
    </span>
  )
}

function rolLabel(rol: string): string {
  return ROL_OPTIONS.find((item) => item.value === rol)?.label ?? rol
}

function usuarioToForm(user: UsuarioApp): FormState {
  return {
    nombre: user.nombre,
    usuario: user.usuario,
    email: user.email ?? '',
    password: '',
    rol: (user.rol as UsuarioAppRol) || 'operador',
    activo: user.activo,
  }
}

function isAdminPrincipal(user: UsuarioApp): boolean {
  return String(user.usuario || '').trim().toLowerCase() === ADMIN_USUARIO
}

function isCurrentUser(user: UsuarioApp, currentUser: AppUsuario | null): boolean {
  return Boolean(currentUser && String(user.id) === String(currentUser.id))
}

function isProtectedUser(user: UsuarioApp, currentUser: AppUsuario | null): boolean {
  return isAdminPrincipal(user) || isCurrentUser(user, currentUser)
}

function protectedDeleteMessage(user: UsuarioApp, currentUser: AppUsuario | null): string {
  if (isCurrentUser(user, currentUser)) {
    return 'No podés eliminar tu propio usuario.'
  }
  if (isAdminPrincipal(user)) {
    return 'No se puede eliminar el usuario administrador principal.'
  }
  return 'No se puede eliminar este usuario.'
}

function UserStatusBadges({ user }: { user: UsuarioApp }) {
  return (
    <div className="flex flex-wrap gap-1">
      {user.activo ? (
        <span className="inline-flex items-center rounded-full border border-emerald-400/25 bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-200">
          Activo
        </span>
      ) : (
        <span className="inline-flex items-center rounded-full border border-rose-400/25 bg-rose-500/15 px-2 py-0.5 text-[11px] font-semibold text-rose-200">
          Inactivo
        </span>
      )}
      {user.requiere_cambio_password ? (
        <span className="inline-flex items-center rounded-full border border-amber-400/25 bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-200">
          Cambio pendiente
        </span>
      ) : null}
    </div>
  )
}

export function UsuariosClient() {
  const { push: pushToast } = useToast()

  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [items, setItems] = React.useState<UsuarioApp[]>([])
  const [query, setQuery] = React.useState('')
  const [currentUser, setCurrentUser] = React.useState<AppUsuario | null>(null)
  const [selectedUsers, setSelectedUsers] = React.useState<string[]>([])
  const [actionsMenuUserId, setActionsMenuUserId] = React.useState<string | null>(null)

  const [modalOpen, setModalOpen] = React.useState(false)
  const [modalMode, setModalMode] = React.useState<'create' | 'edit'>('create')
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [editingUser, setEditingUser] = React.useState<UsuarioApp | null>(null)
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [togglingId, setTogglingId] = React.useState<string | null>(null)
  const [resettingId, setResettingId] = React.useState<string | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const [deleteConfirm, setDeleteConfirm] = React.useState<DeleteConfirmState>({ open: false })
  const [passwordModal, setPasswordModal] = React.useState<PasswordModalState>({ open: false })

  React.useEffect(() => {
    setCurrentUser(readAppUsuario())
  }, [])

  const loadUsuarios = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await get<GetUsuariosAppResponse>('/usuarios-app')
      setItems(Array.isArray(data.usuarios) ? data.usuarios : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void loadUsuarios()
  }, [loadUsuarios])

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((item) => {
      const haystack = [
        item.nombre,
        item.usuario,
        item.email ?? '',
        item.rol,
        item.activo ? 'activo' : 'inactivo',
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [items, query])

  const deletableFiltered = React.useMemo(
    () => filtered.filter((user) => !isProtectedUser(user, currentUser)),
    [filtered, currentUser]
  )

  const allDeletableSelected =
    deletableFiltered.length > 0 &&
    deletableFiltered.every((user) => selectedUsers.includes(user.id))

  const someDeletableSelected =
    deletableFiltered.some((user) => selectedUsers.includes(user.id)) && !allDeletableSelected

  function clearSelection() {
    setSelectedUsers([])
  }

  function toggleUserSelection(userId: string) {
    setSelectedUsers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    )
  }

  function toggleSelectAll() {
    if (allDeletableSelected) {
      setSelectedUsers((prev) => prev.filter((id) => !deletableFiltered.some((user) => user.id === id)))
      return
    }
    const idsToAdd = deletableFiltered.map((user) => user.id)
    setSelectedUsers((prev) => [...new Set([...prev, ...idsToAdd])])
  }

  function openCreateModal() {
    setModalMode('create')
    setEditingId(null)
    setEditingUser(null)
    setForm(resetFormState())
    setFormError(null)
    setActionsMenuUserId(null)
    setModalOpen(true)
  }

  function openEditModal(user: UsuarioApp) {
    setModalMode('edit')
    setEditingId(user.id)
    setEditingUser(user)
    setForm({ ...usuarioToForm(user), password: '' })
    setFormError(null)
    setActionsMenuUserId(null)
    setModalOpen(true)
  }

  function closeModal() {
    if (saving) return
    setModalOpen(false)
    setEditingId(null)
    setEditingUser(null)
    setFormError(null)
    setForm(resetFormState())
  }

  function closePasswordModal() {
    setPasswordModal({ open: false })
  }

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function copyPasswordToClipboard(password: string) {
    try {
      await navigator.clipboard.writeText(password)
      pushToast({ kind: 'success', title: 'Contraseña copiada al portapapeles.' })
    } catch {
      pushToast({ kind: 'error', title: 'No se pudo copiar la contraseña.' })
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    const validationError = validateUsuarioForm(form)
    if (validationError) {
      setFormError(validationError)
      return
    }

    setSaving(true)

    try {
      if (modalMode === 'create') {
        const createdName = form.nombre.trim()
        const createdUsuario = form.usuario.trim()
        const body: CreateUsuarioAppBody = {
          nombre: createdName,
          usuario: createdUsuario,
          email: normalizeEmailForApi(form.email),
          rol: form.rol,
          activo: form.activo,
        }
        const result = await post<UsuarioAppMutationResponse>('/usuarios-app', body)
        setForm(resetFormState())
        setModalOpen(false)
        await loadUsuarios()
        if (result.password_temporal) {
          setPasswordModal({
            open: true,
            password: result.password_temporal,
            userName: createdName,
            usuario: createdUsuario,
          })
        }
      } else if (editingId) {
        const body: UpdateUsuarioAppBody = {
          nombre: form.nombre.trim(),
          usuario: form.usuario.trim(),
          email: normalizeEmailForApi(form.email),
          rol: form.rol,
          activo: form.activo,
        }
        if (form.password.trim()) {
          body.password = form.password
        }
        await put<UsuarioAppMutationResponse>(
          `/usuarios-app/${encodeURIComponent(editingId)}`,
          body
        )
        setForm(resetFormState())
        setEditingUser(null)
        setModalOpen(false)
        await loadUsuarios()
      }
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'No se pudo guardar el usuario.'
      setFormError(message)
    } finally {
      setSaving(false)
    }
  }

  async function handleResetPassword(user: UsuarioApp) {
    setResettingId(user.id)
    setError(null)

    try {
      const body: RestablecerPasswordBody = { id: user.id }
      const result = await post<RestablecerPasswordResponse>(
        '/usuarios-app/restablecer-password',
        body
      )
      await loadUsuarios()
      setPasswordModal({
        open: true,
        password: result.password_temporal,
        userName: user.nombre,
        usuario: user.usuario,
      })
      pushToast({ kind: 'success', title: 'Contraseña restablecida correctamente.' })
    } catch (err) {
      pushToast({
        kind: 'error',
        title:
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'No se pudo restablecer la contraseña.',
      })
    } finally {
      setResettingId(null)
    }
  }

  async function handleToggleActivo(user: UsuarioApp) {
    setTogglingId(user.id)
    setError(null)

    try {
      if (user.activo) {
        await del<UsuarioAppMutationResponse>(
          `/usuarios-app/${encodeURIComponent(user.id)}`
        )
      } else {
        await put<UsuarioAppMutationResponse>(
          `/usuarios-app/${encodeURIComponent(user.id)}`,
          {
            nombre: user.nombre,
            email: user.email ?? '',
            rol: user.rol as UsuarioAppRol,
            activo: true,
          }
        )
      }
      await loadUsuarios()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setTogglingId(null)
    }
  }

  function requestDeleteUser(user: UsuarioApp) {
    if (isProtectedUser(user, currentUser)) {
      pushToast({
        kind: 'error',
        title: protectedDeleteMessage(user, currentUser),
      })
      return
    }
    setDeleteConfirm({ open: true, mode: 'single', user })
  }

  function requestDeleteSelected() {
    const selectedItems = items.filter((user) => selectedUsers.includes(user.id))
    const protectedItems = selectedItems.filter((user) => isProtectedUser(user, currentUser))

    if (protectedItems.length > 0) {
      pushToast({
        kind: 'error',
        title:
          protectedItems.length === 1
            ? protectedDeleteMessage(protectedItems[0], currentUser)
            : 'La selección incluye usuarios que no se pueden eliminar.',
      })
      return
    }

    const ids = selectedItems.map((user) => user.id)
    if (!ids.length) return

    setDeleteConfirm({ open: true, mode: 'bulk', count: ids.length, ids })
  }

  function closeDeleteConfirm() {
    if (deleting) return
    setDeleteConfirm({ open: false })
  }

  async function executeDelete() {
    if (!deleteConfirm.open || !currentUser?.id) return

    const confirmState = deleteConfirm
    const ids =
      confirmState.mode === 'single' ? [confirmState.user.id] : confirmState.ids

    setDeleting(true)

    try {
      const body: EliminarUsuariosAppBody = {
        ids,
        currentUserId: currentUser.id,
      }
      const result = await post<EliminarUsuariosAppResponse>('/usuarios-app/eliminar', body)

      setDeleteConfirm({ open: false })
      clearSelection()
      await loadUsuarios()

      pushToast({
        kind: 'success',
        title:
          confirmState.mode === 'single'
            ? 'Usuario eliminado correctamente.'
            : `Se eliminaron ${result.eliminados} usuarios correctamente.`,
      })
    } catch (err) {
      pushToast({
        kind: 'error',
        title:
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'No se pudo eliminar el usuario.',
      })
    } finally {
      setDeleting(false)
    }
  }

  const deleteDialogDescription =
    deleteConfirm.open && deleteConfirm.mode === 'single'
      ? '¿Está seguro que desea eliminar este usuario?'
      : deleteConfirm.open && deleteConfirm.mode === 'bulk'
        ? `¿Está seguro que desea eliminar ${deleteConfirm.count} usuarios?`
        : undefined

  return (
    <>
      <PageHeader
        title="Usuarios"
        subtitle="Administración de cuentas de acceso al sistema Serv. Esp."
        right={
          <button type="button" className={BTN_PRIMARY} onClick={openCreateModal}>
            Nuevo usuario
          </button>
        }
      />

        {loading ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-sm text-sky-200/80">
            Cargando usuarios…
          </div>
        ) : null}

        {error ? (
          <InlineMessage kind="error" title={error} className="w-full border-rose-400/30" />
        ) : null}

        {!loading ? (
          <section className={COORD_PANEL}>
            <div className="border-b border-white/10 px-4 py-4 sm:px-5">
              <label className={LABEL_CLASS}>Buscar</label>
              <input
                className={INPUT_CLASS}
                placeholder="Nombre, usuario, email, rol…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoComplete="off"
              />
            </div>

            <div className="px-4 py-4 sm:px-5">
              {selectedUsers.length > 0 ? (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-400/20 bg-sky-500/10 px-4 py-2.5">
                  <span className="text-sm font-medium text-sky-100">
                    {selectedUsers.length}{' '}
                    {selectedUsers.length === 1 ? 'usuario seleccionado' : 'usuarios seleccionados'}
                  </span>
                  <button
                    type="button"
                    className={BTN_DANGER}
                    disabled={deleting}
                    onClick={requestDeleteSelected}
                  >
                    Eliminar seleccionados
                  </button>
                </div>
              ) : null}

              {filtered.length === 0 ? (
                <div className="py-10 text-center">
                  <EmptyState
                    title="Sin usuarios"
                    description={
                      query.trim()
                        ? 'No hay resultados para la búsqueda actual.'
                        : 'Todavía no hay usuarios cargados en el sistema.'
                    }
                  />
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-white/10">
                  <table className="min-w-[960px] w-full border-collapse">
                    <thead>
                      <tr className="border-b border-white/10 bg-white/[0.04]">
                        <th className="w-10 px-3 py-2.5 text-left">
                          <input
                            type="checkbox"
                            className={CHECKBOX_CLASS}
                            checked={allDeletableSelected}
                            ref={(input) => {
                              if (input) input.indeterminate = someDeletableSelected
                            }}
                            onChange={toggleSelectAll}
                            disabled={deletableFiltered.length === 0}
                            aria-label="Seleccionar todos los usuarios"
                          />
                        </th>
                        <th className={cn(LABEL_CLASS, 'px-3 py-2.5 text-left')}>Nombre</th>
                        <th className={cn(LABEL_CLASS, 'px-3 py-2.5 text-left')}>Usuario</th>
                        <th className={cn(LABEL_CLASS, 'px-3 py-2.5 text-left')}>Email</th>
                        <th className={cn(LABEL_CLASS, 'px-3 py-2.5 text-left')}>Rol</th>
                        <th className={cn(LABEL_CLASS, 'px-3 py-2.5 text-left')}>Estado</th>
                        <th className={cn(LABEL_CLASS, 'px-3 py-2.5 text-right')}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((user) => {
                        const protectedUser = isProtectedUser(user, currentUser)
                        const isSelected = selectedUsers.includes(user.id)

                        return (
                          <tr
                            key={user.id}
                            className={cn(
                              'border-b border-white/5 transition-colors',
                              isSelected ? 'bg-sky-400/10' : 'hover:bg-white/[0.03]'
                            )}
                          >
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                className={CHECKBOX_CLASS}
                                checked={isSelected}
                                disabled={protectedUser}
                                onChange={() => toggleUserSelection(user.id)}
                                aria-label={`Seleccionar ${user.nombre}`}
                              />
                            </td>
                            <td className="px-3 py-2 text-sm font-medium text-white">
                              {user.nombre}
                            </td>
                            <td className="px-3 py-2 text-sm text-sky-100/90">{user.usuario}</td>
                            <td className="px-3 py-2 text-sm text-sky-100">{formatEmailCell(user.email)}</td>
                            <td className="px-3 py-2 text-sm text-sky-200/80">
                              {rolLabel(String(user.rol))}
                            </td>
                            <td className="px-3 py-2">
                              <UserStatusBadges user={user} />
                            </td>
                            <td className="px-3 py-2 text-right">
                              <UsuarioRowActions
                                user={user}
                                open={actionsMenuUserId === user.id}
                                onToggle={() =>
                                  setActionsMenuUserId((prev) =>
                                    prev === user.id ? null : user.id
                                  )
                                }
                                onClose={() => setActionsMenuUserId(null)}
                                protectedUser={protectedUser}
                                toggling={togglingId === user.id}
                                resetting={resettingId === user.id}
                                deleting={deleting}
                                onEdit={() => openEditModal(user)}
                                onReset={() => void handleResetPassword(user)}
                                onToggleActivo={() => void handleToggleActivo(user)}
                                onDelete={() => requestDeleteUser(user)}
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        ) : null}

        <ConfirmDialog
          open={deleteConfirm.open}
          title="Eliminar usuario"
          description={deleteDialogDescription}
          confirmLabel="Eliminar"
          cancelLabel="Cancelar"
          destructive
          onCancel={closeDeleteConfirm}
          onConfirm={executeDelete}
        />

        <Modal
          open={modalOpen}
          onClose={closeModal}
          title={modalMode === 'create' ? 'Nuevo usuario' : 'Editar usuario'}
          compact
          maxWidthClassName="max-w-[700px]"
          className={MODAL_CLASS}
          headerClassName={MODAL_HEADER_CLASS}
          bodyClassName="py-3"
          footerClassName={MODAL_FOOTER_CLASS}
          footer={
            <div className="flex justify-end gap-2">
              <button type="button" className={BTN_SECONDARY} onClick={closeModal} disabled={saving}>
                Cancelar
              </button>
              <button
                type="submit"
                form="usuarios-form"
                className={BTN_PRIMARY}
                disabled={saving}
              >
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          }
        >
          <form
            id="usuarios-form"
            key={modalMode === 'create' ? 'usuarios-create' : `usuarios-edit-${editingId ?? 'none'}`}
            className="space-y-3"
            onSubmit={handleSubmit}
            autoComplete="off"
          >
            {formError ? (
              <InlineMessage kind="error" title={formError} className="w-full" />
            ) : null}

            {modalMode === 'edit' ? (
              <>
                <div className={FORM_GRID}>
                  <div>
                    <label htmlFor="usuarios-app-nombre" className={LABEL_CLASS}>
                      Nombre
                    </label>
                    <input
                      id="usuarios-app-nombre"
                      name="usuarios-app-nombre"
                      className={INPUT_CLASS}
                      value={form.nombre}
                      onChange={(e) => updateForm('nombre', e.target.value)}
                      required
                      disabled={saving}
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label htmlFor="usuarios-app-usuario-edit" className={LABEL_CLASS}>
                      Usuario
                    </label>
                    <input
                      id="usuarios-app-usuario-edit"
                      name="usuarios-app-usuario-edit"
                      className={INPUT_CLASS}
                      value={form.usuario}
                      onChange={(e) => updateForm('usuario', e.target.value)}
                      required
                      disabled={saving}
                      autoComplete="off"
                    />
                  </div>

                  <div>
                    <label htmlFor="usuarios-app-email" className={LABEL_CLASS}>
                      Correo electrónico (opcional)
                    </label>
                    <input
                      id="usuarios-app-email"
                      name="usuarios-app-email"
                      type="text"
                      inputMode="email"
                      className={INPUT_CLASS}
                      value={form.email}
                      onChange={(e) => updateForm('email', e.target.value)}
                      disabled={saving}
                      autoComplete="off"
                      placeholder="Falta correo electrónico"
                    />
                    {!form.email.trim() ? (
                      <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-amber-200/90">
                        <span aria-hidden>⚠</span>
                        <span>Sin correo</span>
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <label className={LABEL_CLASS}>Rol</label>
                    <select
                      className={INPUT_CLASS}
                      value={form.rol}
                      onChange={(e) => updateForm('rol', e.target.value as UsuarioAppRol)}
                      disabled={saving}
                    >
                      {ROL_OPTIONS.map((option) => (
                        <option
                          key={option.value}
                          value={option.value}
                          className="bg-[#0f2433] text-white"
                        >
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="usuarios-app-password" className={LABEL_CLASS}>
                      Nueva contraseña (opcional)
                    </label>
                    <PasswordInput
                      key={`usuarios-edit-password-${editingId ?? 'none'}`}
                      id="usuarios-app-password"
                      value={form.password}
                      onChange={(value) => updateForm('password', value)}
                      disabled={saving}
                      autoComplete="new-password"
                      inputClassName={PASSWORD_INPUT_CLASS}
                    />
                  </div>
                  <div>
                    <label className={LABEL_CLASS}>Estado</label>
                    <div className={READONLY_CLASS}>
                      {form.activo ? (
                        <span className="inline-flex items-center rounded-full border border-emerald-400/25 bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-200">
                          Activo
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full border border-rose-400/25 bg-rose-500/15 px-2 py-0.5 text-[11px] font-semibold text-rose-200">
                          Inactivo
                        </span>
                      )}
                    </div>
                  </div>

                  {editingUser ? (
                    <>
                      <div>
                        <label className={LABEL_CLASS}>Fecha de creación</label>
                        <div className={READONLY_CLASS}>
                          {formatDateTimeEsAr(editingUser.created_at) || '—'}
                        </div>
                      </div>
                      <div>
                        <label className={LABEL_CLASS}>Cambio pendiente</label>
                        <div className={READONLY_CLASS}>
                          {editingUser.requiere_cambio_password ? (
                            <span className="inline-flex items-center rounded-full border border-amber-400/25 bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-200">
                              Sí — pendiente
                            </span>
                          ) : (
                            <span className="text-sky-200/80">No</span>
                          )}
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>

                <label className="flex items-center gap-2.5 border-t border-white/10 pt-3 text-sm text-sky-100">
                  <input
                    type="checkbox"
                    checked={form.activo}
                    onChange={(e) => updateForm('activo', e.target.checked)}
                    disabled={saving}
                    className={CHECKBOX_CLASS}
                  />
                  <span>Usuario activo</span>
                </label>
              </>
            ) : (
              <>
                <div className={FORM_GRID}>
                  <div>
                    <label htmlFor="usuarios-app-nombre" className={LABEL_CLASS}>
                      Nombre
                    </label>
                    <input
                      id="usuarios-app-nombre"
                      name="usuarios-app-nombre"
                      className={INPUT_CLASS}
                      value={form.nombre}
                      onChange={(e) => updateForm('nombre', e.target.value)}
                      required
                      disabled={saving}
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label htmlFor="usuarios-app-usuario" className={LABEL_CLASS}>
                      Usuario
                    </label>
                    <input
                      id="usuarios-app-usuario"
                      name="usuarios-app-usuario"
                      className={INPUT_CLASS}
                      value={form.usuario}
                      onChange={(e) => updateForm('usuario', e.target.value)}
                      required
                      disabled={saving}
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <label htmlFor="usuarios-app-email" className={LABEL_CLASS}>
                      Correo electrónico (opcional)
                    </label>
                    <input
                      id="usuarios-app-email"
                      name="usuarios-app-email"
                      type="text"
                      inputMode="email"
                      className={INPUT_CLASS}
                      value={form.email}
                      onChange={(e) => updateForm('email', e.target.value)}
                      disabled={saving}
                      autoComplete="off"
                      placeholder="Falta correo electrónico"
                    />
                  </div>
                  <div>
                    <label className={LABEL_CLASS}>Rol</label>
                    <select
                      className={INPUT_CLASS}
                      value={form.rol}
                      onChange={(e) => updateForm('rol', e.target.value as UsuarioAppRol)}
                      disabled={saving}
                    >
                      {ROL_OPTIONS.map((option) => (
                        <option
                          key={option.value}
                          value={option.value}
                          className="bg-[#0f2433] text-white"
                        >
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className={LABEL_CLASS}>Contraseña</label>
                  <PasswordInput
                    key="usuarios-create-password"
                    value=""
                    readOnly
                    disabled={saving}
                    autoComplete="new-password"
                    placeholder="Se generará al guardar"
                    inputClassName={PASSWORD_INPUT_CLASS}
                  />
                  <p className="mt-1.5 text-[11px] leading-snug text-sky-200/60">
                    Se generará una contraseña temporal al guardar.
                  </p>
                </div>

                <label className="flex items-center gap-2.5 border-t border-white/10 pt-3 text-sm text-sky-100">
                  <input
                    type="checkbox"
                    checked={form.activo}
                    onChange={(e) => updateForm('activo', e.target.checked)}
                    disabled={saving}
                    className={CHECKBOX_CLASS}
                  />
                  <span>Usuario activo</span>
                </label>
              </>
            )}
          </form>
        </Modal>

        <Modal
          open={passwordModal.open}
          onClose={closePasswordModal}
          title="Contraseña temporal"
          compact
          maxWidthClassName="max-w-[700px]"
          className={MODAL_CLASS}
          headerClassName={MODAL_HEADER_CLASS}
          footerClassName={MODAL_FOOTER_CLASS}
          footer={
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className={BTN_SECONDARY}
                onClick={() => {
                  if (passwordModal.open) {
                    void copyPasswordToClipboard(passwordModal.password)
                  }
                }}
              >
                Copiar
              </button>
              <button type="button" className={BTN_PRIMARY} onClick={closePasswordModal}>
                Entendido
              </button>
            </div>
          }
        >
          {passwordModal.open ? (
            <div className="space-y-3">
              <p className="text-xs leading-snug text-sky-200/70">
                Compartí esta contraseña temporal con el usuario. Solo se muestra una vez.
              </p>

              <div className={FORM_GRID}>
                <div>
                  <label className={LABEL_CLASS}>Usuario</label>
                  <div className={READONLY_CLASS}>{passwordModal.usuario}</div>
                </div>
                <div>
                  <label className={LABEL_CLASS}>Nombre</label>
                  <div className={READONLY_CLASS}>{passwordModal.userName}</div>
                </div>
              </div>

              <div>
                <label className={LABEL_CLASS}>Contraseña temporal</label>
                <PasswordInput
                  key={`temp-password-${passwordModal.password}`}
                  readOnly
                  value={passwordModal.password}
                  autoComplete="new-password"
                  inputClassName={PASSWORD_INPUT_CLASS}
                />
              </div>
            </div>
          ) : null}
        </Modal>
    </>
  )
}
