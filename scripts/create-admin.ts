import bcrypt from "bcryptjs"
import { database } from "@/db"
import { Admins } from "@/db/models/admin"
import { Users } from "@/db/models/user"

const [, , login, password] = process.argv

if (!login || !password) {
    console.error("Usage: npm run create-admin -- <login> <password>")
    process.exit(1)
}

const passwordHash = bcrypt.hashSync(password, 12)
const existingUser = Users.getOneBy("login", login)

let userId: number

if (existingUser) {
    const [, updateError] = Users.update({
        ...existingUser,
        passwordHash,
    })

    if (updateError) {
        console.error(`Failed to update password for existing user "${login}": ${updateError.message}`)
        process.exit(1)
    }

    userId = existingUser.id
} else {
    const [createdUser, createError] = Users.insert(
        {
            login,
            passwordHash,
        },
        true,
    )

    if (createError || !createdUser) {
        console.error(`Failed to create user "${login}": ${createError?.message ?? "unknown error"}`)
        process.exit(1)
    }

    userId = createdUser.id
}

const existingAdmin = Admins.getOneBy("userId", userId)

if (!existingAdmin) {
    const [, adminError] = Admins.insert({ userId })

    if (adminError) {
        console.error(`Failed to grant admin rights to "${login}": ${adminError.message}`)
        process.exit(1)
    }
}

database.close()

console.log(existingUser ? `Updated admin user "${login}".` : `Created admin user "${login}".`)
