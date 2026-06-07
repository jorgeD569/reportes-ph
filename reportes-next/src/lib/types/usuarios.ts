export type UsuarioAppRol = 'operador' | 'supervisor' | 'coordinador' | 'admin'



export type UsuarioApp = {

  id: string

  nombre: string

  usuario: string

  email: string | null

  rol: UsuarioAppRol | string

  activo: boolean

  requiere_cambio_password?: boolean

  created_at: string

  updated_at: string

}



export type GetUsuariosAppResponse = {

  ok: boolean

  usuarios: UsuarioApp[]

}



export type UsuarioAppMutationResponse = {

  ok: boolean

  usuario: UsuarioApp

  password_temporal?: string

}



export type CreateUsuarioAppBody = {

  nombre: string

  usuario: string

  email: string

  rol: UsuarioAppRol

  activo: boolean

}



export type UpdateUsuarioAppBody = {
  nombre: string
  usuario: string
  email: string
  rol: UsuarioAppRol
  activo: boolean
  password?: string
}



export type EliminarUsuariosAppBody = {

  ids: string[]

  currentUserId: string

}



export type EliminarUsuariosAppResponse = {

  ok: boolean

  eliminados: number

}



export type CambiarPasswordBody = {

  userId: string

  passwordActual: string

  passwordNueva: string

}



export type CambiarPasswordResponse = {

  ok: boolean

  usuario: {

    id: string

    nombre: string

    usuario: string

    email: string | null

    rol: string

    requiere_cambio_password: boolean

  }

}



export type RestablecerPasswordBody = {

  id: string

}



export type RestablecerPasswordResponse = {

  ok: boolean

  password_temporal: string

  usuario: UsuarioApp

}


