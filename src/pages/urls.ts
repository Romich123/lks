export const urls = {
    index: "/",

    teachers: "/teachers",
    classrooms: "/classrooms",
    lessons: "/lessons",
    equipment: "/equipment",
    schedule: "/schedule",
    timetableShow: "/timetabled",
    timetableEdit: "/wScheduleEdit",

    classroom(id: string | number) {
        return "/classroom/" + id
    },
}
