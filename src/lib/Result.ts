export type Success<T> = [T, null]
export type Failure<T> = [null, T]

export type Result<T, E = Error> = Success<T> | Failure<E>
