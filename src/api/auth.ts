import { SerializedUser, serializeUser, User, Users } from "@/db/models/user"
import { ResponseErrors } from "./errors"
import { Admins } from "@/db/models/admin"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"

export type CookieStore = {
    get(name: string): string | undefined
    set(name: string, value: string): void
}

export type AppRequest = {
    url: string
    params: Record<string, string>
    cookies: CookieStore
    json(): Promise<unknown>
    user?: User
    admin?: boolean
}

export type RouteHandler<TReq extends AppRequest = AppRequest> = (req: TReq) => Response | Promise<Response>

export type AuthenticatedRequest = AppRequest & {
    user: User
}

export type AdminRequest = AppRequest & {
    user: User
    admin: true
}

const authCookie = "auth"

export function userToJwt(user: User | SerializedUser, isAdmin: boolean = false) {
    user = serializeUser(user as User, isAdmin)

    return jwt.sign(user, process.env.JWT_SECRET!)
}

export function getUser(req: Pick<AppRequest, "cookies">) {
    const auth = req.cookies.get(authCookie)

    if (!auth) {
        return null
    }

    try {
        const token = jwt.verify(auth, process.env.JWT_SECRET!)

        if (typeof token !== "object" || !("id" in token)) {
            return null
        }

        const possibleUser = Users.getOneBy("id", token.id as number)

        if (!possibleUser) {
            return null
        }

        return possibleUser
    } catch {}
    return null
}

export function getAdmin(req: Pick<AppRequest, "cookies">) {
    const auth = req.cookies.get(authCookie)

    if (!auth) {
        return null
    }

    try {
        const token = jwt.verify(auth, process.env.JWT_SECRET!)

        if (typeof token !== "object" || !("id" in token)) {
            return null
        }

        const possibleAdmin = Admins.getOneBy("userId", token.id as number)

        if (!possibleAdmin) {
            return null
        }

        return [possibleAdmin, Users.getOneBy("id", token.id as number)!] as const
    } catch {}
    return null
}

export function requiresAdmin(handler: RouteHandler<AdminRequest>): RouteHandler {
    return (req) => {
        const [admin, user] = getAdmin(req) ?? []

        if (!admin) {
            return Response.json({ success: false, requiresAuth: true, requiresAdmin: true, error: ResponseErrors.authRequired() })
        }

        req.user = user
        req.admin = true

        return handler(req as AdminRequest)
    }
}

export function requiresAuth(handler: RouteHandler<AuthenticatedRequest>): RouteHandler {
    return (req) => {
        const user = getUser(req)

        if (!user) {
            return Response.json({ success: false, requiresAuth: true, error: ResponseErrors.authRequired() })
        }

        req.user = user

        return handler(req as AuthenticatedRequest)
    }
}

export async function loginHandler(req: AppRequest) {
    const body = await req.json()

    if (typeof body !== "object" || !body) {
        return Response.json({ success: false, error: ResponseErrors.wrongType("request body", "json object") }, { status: 400 })
    }

    if (!("login" in body && typeof body.login === "string") || !("password" in body && typeof body.password === "string")) {
        return Response.json({ success: false, error: ResponseErrors.wrongType("body.(password|login)", "string") }, { status: 400 })
    }

    const candidate = Users.getOneBy("login", body.login)

    if (!candidate) {
        return Response.json({ success: false, error: ResponseErrors.wrongLoginOrPassword() }, { status: 400 })
    }

    if (!(await bcrypt.compare(body.password, candidate.passwordHash))) {
        return Response.json({ success: false, error: ResponseErrors.wrongLoginOrPassword() }, { status: 400 })
    }

    const admin = Admins.getOneBy("userId", candidate.id)

    const serializedUser = serializeUser(candidate, !!admin)

    req.cookies.set(authCookie, jwt.sign(serializedUser, process.env.JWT_SECRET!))

    return Response.json({ success: true, user: serializedUser })
}

export function recheckHandler(req: AppRequest) {
    const user = getUser(req)

    if (!user) {
        return Response.json({ success: false, requiresAuth: true, error: ResponseErrors.authRequired() })
    }

    const admin = Admins.getOneBy("userId", user.id)
    const newJwt = userToJwt(user, !!admin)

    req.cookies.set(authCookie, newJwt)

    return Response.json({ success: true, user: serializeUser(user, !!admin), jwt: newJwt })
}
