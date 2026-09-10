export const urls = {
    index: "/",

    cleaningSignatures: "/cleaningSignatures",
    schedule: "/schedule",
    timetableShow: "/timetabled",
    timetableEdit: "/wScheduleEdit",

    teachers: "/teachers",
    classrooms: "/classrooms",
    lessons: "/lessons",
    equipment: "/equipment",
    


    classroom(id: string | number) {
        return "/classroom/" + id
    },
}
