if (!process.env.JWT_SECRET || typeof process.env.JWT_SECRET !== "string") {
    throw new Error()
}

declare module "bun" {
    interface Env {
        JWT_SECRET: string
    }
}
