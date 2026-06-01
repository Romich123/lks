import { SerializedUser } from "@/db/models/user"
import { Result } from "@/lib/Result"
import { createContext, useCallback, useEffect, useRef, useState } from "react"
import styles from "./index.module.css"
import { Modal } from "../Modal"

export const authContext = createContext<{
    /**
     * If user is logged in then it just returns it
     * If bot, then login window opens
     */
    requestAuth(options?: RequestAuthOptions): Promise<Result<SerializedUser, any>>
    /**
     * wrapper around requestAuth
     */
    requestAdmin(): Promise<Result<SerializedUser & { isAdmin: true }, any>>
    user: SerializedUser | null
}>({} as any)

export type RequestAuthOptions = {
    message?: string
    quitAfterBadAttempt?: boolean
    neededAdmin?: boolean
}

export function AuthProvider(props: React.PropsWithChildren) {
    const [modalOpen, setModalOpen] = useState(false)
    const [authCallback, setAuthCallback] = useState<((user?: SerializedUser | null) => void) | null>(null)
    const [currentUser, setCurrentUser] = useState<SerializedUser | null>(JSON.parse(localStorage.getItem("user") || "null"))
    const [currentOptions, setCurrentOptions] = useState<RequestAuthOptions>({})

    useEffect(() => {
        localStorage.setItem("user", JSON.stringify(currentUser))
    }, [currentUser])

    useEffect(() => {
        const intervalId = setInterval(async () => {
            try {
                const result = await (await fetch("/api/authCheck")).json()

                if (result.success) {
                    setCurrentUser(result.user)
                } else {
                    setCurrentUser(null)
                }
            } catch {
                setCurrentUser(null)
            }
        }, 3000)

        return () => clearInterval(intervalId)
    }, [currentUser])

    const requestAuth = useCallback(
        (options?: RequestAuthOptions) => {
            if (currentUser && (!options?.neededAdmin || currentUser.isAdmin)) {
                return Promise.resolve<Result<SerializedUser, string>>([currentUser, null])
            }

            setCurrentOptions(options ?? {})
            setModalOpen(true)

            return new Promise<Result<SerializedUser, string>>((resolve) => {
                setAuthCallback(() => (user?: SerializedUser | null) => {
                    if (user && (user.isAdmin || !options?.neededAdmin)) {
                        resolve([user, null])
                        setCurrentUser(user)
                        setAuthCallback(null)
                        setModalOpen(false)
                    } else {
                        resolve([null, "Не удалось войти"])
                        setCurrentUser(null)
                        setAuthCallback(null)
                        setModalOpen(false)
                    }
                })
            })
        },
        [currentUser, setCurrentOptions, setModalOpen, setAuthCallback],
    )

    const requestAdmin = useCallback(async () => (await requestAuth({ neededAdmin: true, message: "Нужны права администратора" })) as Result<SerializedUser & { isAdmin: true }>, [requestAuth])

    return (
        <authContext.Provider
            value={{
                requestAdmin,
                requestAuth,
                user: currentUser,
            }}
        >
            <AuthModal
                options={currentOptions}
                open={modalOpen}
                onClose={() => {
                    authCallback?.(null)
                    setModalOpen(false)
                }}
                callback={authCallback}
            />
            {props.children}
        </authContext.Provider>
    )
}

type AuthModalProps = {
    options: RequestAuthOptions
    open?: boolean
    callback?: ((u?: SerializedUser | null) => void) | null
    onClose?: () => void
}

function AuthModal({ options, open, callback, onClose }: AuthModalProps) {
    const [error, setError] = useState<null | string>(null)
    const [isLoading, setIsLoading] = useState(false)

    const loginRef = useRef<HTMLInputElement>(null)
    const passwordRef = useRef<HTMLInputElement>(null)

    const handleSubmit = async (e: React.SubmitEvent) => {
        e.preventDefault()

        if (!loginRef.current || !passwordRef.current) {
            return
        }

        setIsLoading(true)
        setError(null)

        try {
            const response = await fetch("/api/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    login: loginRef.current.value,
                    password: passwordRef.current.value,
                }),
            })

            const result = await response.json()

            if (!result.success) {
                setError("Неправильный логин или пароль")
                setIsLoading(false)
                return
            }

            if (options.neededAdmin && !result.user?.isAdmin) {
                setError("Вы вошли за пользователя без прав администратора")
                setIsLoading(false)
                return
            }
            callback?.(result.user)
        } catch {
            setError("Ошибка соединения. Попробуйте позже.")
        } finally {
            setIsLoading(false)
        }
    }

    const handleClose = () => {
        onClose?.()
        setError(null)
        setIsLoading(false)
    }

    return (
        <Modal open={open} onClickOutside={handleClose}>
            <form className={styles.form} onSubmit={handleSubmit}>
                <div className={styles.top}>
                    <div className={styles.title}>Вход</div>
                    <div className={styles.message}>{options.message ?? "Войдите в свой аккаунт"}</div>
                </div>

                <div className={styles.inputs}>
                    <div className={styles["input-group"]}>
                        <svg className={styles["input-icon"]} xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 16 16">
                            <path d="M3 14s-1 0-1-1 1-4 6-4 6 3 6 4-1 1-1 1zm5-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6" />
                        </svg>
                        <input id="auth-login-input" ref={loginRef} type="text" className={styles["input-field"]} placeholder=" " autoComplete="username" autoFocus disabled={isLoading} />
                        <label htmlFor="auth-login-input" className={styles["input-label"]}>
                            Логин
                        </label>
                    </div>

                    <div className={styles["input-group"]}>
                        <svg className={styles["input-icon"]} xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 16 16">
                            <path
                                fillRule="evenodd"
                                d="M8 0a4 4 0 0 1 4 4v2.05a2.5 2.5 0 0 1 2 2.45v5a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 2 13.5v-5a2.5 2.5 0 0 1 2-2.45V4a4 4 0 0 1 4-4m0 1a3 3 0 0 0-3 3v2h6V4a3 3 0 0 0-3-3"
                            />
                        </svg>
                        <input id="auth-password-input" ref={passwordRef} type="password" className={styles["input-field"]} placeholder=" " autoComplete="current-password" disabled={isLoading} />
                        <label htmlFor="auth-password-input" className={styles["input-label"]}>
                            Пароль
                        </label>
                    </div>
                </div>

                {error && <div className={styles.error}>{error}</div>}

                <button type="submit" className={styles.submit} disabled={isLoading}>
                    {isLoading ? "Вход..." : "Войти"}
                </button>
            </form>
        </Modal>
    )
}
