from enum import StrEnum


class UserRole(StrEnum):
    admin = "admin"
    dispatcher = "dispatcher"


class HandymanStatus(StrEnum):
    active = "active"
    inactive = "inactive"


class TaskCategory(StrEnum):
    plumbing = "plumbing"
    electrical = "electrical"
    hvac = "hvac"
    carpentry = "carpentry"
    painting = "painting"
    appliance = "appliance"
    general = "general"
    other = "other"


class TaskPriority(StrEnum):
    low = "low"
    normal = "normal"
    high = "high"
    urgent = "urgent"


class TaskStatus(StrEnum):
    new = "new"
    assigned = "assigned"
    in_progress = "in_progress"
    done = "done"
    cancelled = "cancelled"


#: Allowed status transitions — SPEC §4.
#: new → assigned additionally requires an assigned handyman (checked in the service).
STATUS_TRANSITIONS: dict[TaskStatus, set[TaskStatus]] = {
    TaskStatus.new: {TaskStatus.assigned, TaskStatus.cancelled},
    TaskStatus.assigned: {TaskStatus.in_progress, TaskStatus.new, TaskStatus.cancelled},
    TaskStatus.in_progress: {TaskStatus.done, TaskStatus.cancelled},
    TaskStatus.done: set(),
    TaskStatus.cancelled: set(),
}

TERMINAL_STATUSES: set[TaskStatus] = {TaskStatus.done, TaskStatus.cancelled}
