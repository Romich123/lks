import { SerializedUser, serializeUser, User, Users } from "@/db/models/user"
import { ResponseErrors } from "./errors"
import { password, BunRequest } from "bun"
import { Admins } from "@/db/models/admin"
import jwt from "jsonwebtoken"

declare module "bun" {
    // Augment the existing interface
    interface BunRequest {
        user?: User
        admin?: boolean
    }
}

export type AuthenticatedRequest = BunRequest & {
    user: User
}

export type AdminRequest = BunRequest & {
    user: User
    admin: true
}

const authCookie = "auth"

export function userToJwt(user: User | SerializedUser, isAdmin: boolean = false) {
    user = serializeUser(user as User, isAdmin)

    return jwt.sign(user, process.env.JWT_SECRET)
}

export function getUser(req: BunRequest) {
    const auth = req.cookies.get(authCookie)

    if (!auth) {
        return null
    }

    try {
        const token = jwt.verify(auth, process.env.JWT_SECRET!)

        if (typeof token !== "object" || !("id" in token)) {
            return null
        }

        const possibleUser = Users.getOneBy("id", token.id)

        if (!possibleUser) {
            return null
        }

        return possibleUser
    } catch {}
    return null
}

export function getAdmin(req: BunRequest) {
    const auth = req.cookies.get(authCookie)

    if (!auth) {
        return null
    }

    try {
        const token = jwt.verify(auth, process.env.JWT_SECRET!)

        if (typeof token !== "object" || !("id" in token)) {
            return null
        }

        const possibleAdmin = Admins.getOneBy("userId", token.id)

        if (!possibleAdmin) {
            return null
        }

        return [possibleAdmin, Users.getOneBy("id", token.id)!] as const
    } catch {}
    return null
}

export function requiresAdmin(handler: Bun.Serve.Handler<AdminRequest, any, Response>) {
    return ((req, ...args) => {
        const [admin, user] = getAdmin(req) ?? []

        if (!admin) {
            return Response.json({ success: false, requiresAuth: true, requiresAdmin: true, error: ResponseErrors.authRequired() })
        }

        req.user = user
        req.admin = true

        return handler(req as AdminRequest, ...args)
    }) satisfies Bun.Serve.Handler<Bun.BunRequest, any, Response>
}

export function requiresAuth(handler: Bun.Serve.Handler<AuthenticatedRequest, any, Response>) {
    return ((req, ...args) => {
        const user = getUser(req)

        if (!user) {
            return Response.json({ success: false, requiresAuth: true, error: ResponseErrors.authRequired() })
        }

        req.user = user

        return handler(req as AuthenticatedRequest, ...args)
    }) satisfies Bun.Serve.Handler<BunRequest, any, Response>
}

export async function loginHandler(req: BunRequest) {
    const body = await req.json()

    if (typeof body !== "object" && body) {
        return Response.json({ success: false, error: ResponseErrors.wrongType("request body", "json object") }, { status: 400 })
    }

    if (!("login" in body && typeof body.login === "string") || !("password" in body && typeof body.password === "string")) {
        return Response.json({ success: false, error: ResponseErrors.wrongType("body.(password|login)", "string") }, { status: 400 })
    }

    const candidate = Users.getOneBy("login", body.login)

    if (!candidate) {
        return Response.json({ success: false, error: ResponseErrors.wrongLoginOrPassword() }, { status: 400 })
    }

    if (!(await password.verify(body.password, candidate.passwordHash))) {
        return Response.json({ success: false, error: ResponseErrors.wrongLoginOrPassword() }, { status: 400 })
    }

    const admin = Admins.getOneBy("userId", candidate.id)

    const serializedUser = serializeUser(candidate, !!admin)

    req.cookies.set(authCookie, jwt.sign(serializedUser, process.env.JWT_SECRET!))

    return Response.json({ success: true, user: serializedUser })
}

export function recheckHandler(req: BunRequest) {
    const user = getUser(req)

    if (!user) {
        return Response.json({ success: false, requiresAuth: true, error: ResponseErrors.authRequired() })
    }

    const admin = Admins.getOneBy("userId", user.id)
    const newJwt = userToJwt(user, !!admin)

    req.cookies.set(authCookie, newJwt)

    return Response.json({ success: true, user: serializeUser(user, !!admin), jwt: newJwt })
}
