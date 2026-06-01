export const ResponseErrors = Object.freeze({
    wrongType(param: string, requiredType: string) {
        return { errorCode: "wrongType", param, requiredType, message: `Параметр ${param} должен быть типа ${requiredType}` }
    },
    internal() {
        return { errorCode: "internal" }
    },
    authRequired() {
        return { errorCode: "authRequired" }
    },
    wrongLoginOrPassword() {
        return { errorCode: "wrongLoginOrPassword" }
    },
})
