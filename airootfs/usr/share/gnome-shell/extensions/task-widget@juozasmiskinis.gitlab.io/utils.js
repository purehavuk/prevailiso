'use strict';

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

let EDataServer, ECal;

try {
    EDataServer = (await import('gi://EDataServer')).default;
    ECal = (await import('gi://ECal')).default;
} catch (e) {
    // One or more required modules are not installed on the system.
}

export const _debounceTimeoutIds = new Map();
export const ELLIPSIS_CHAR_ = '\u2026';
export const ARC_UP_LEFT_CHAR_ = '\u256F';
export const ARC_UP_RIGHT_CHAR_ = '\u2570';
export const EM_DASH_CHAR_ = '\u2014';
export const MINUTES_PER_HOUR_ = 60;
export const MINUTES_PER_DAY_ = MINUTES_PER_HOUR_ * 24;
export const MSECS_IN_DAY_ = MINUTES_PER_DAY_ * 60 * 1000;
export const LL_THRESHOLD_ = 100;

export const TIME_UNITS_ = {
    seconds: 0,
    minutes: 1,
    hours: 2,
    days: 3
};

export const HIDE_COMPLETED_TASKS_ = {
    never: 0,
    immediately: 1,
    'after-time-period': 2,
    'after-specified-time': 3
};

export const HIDE_COMPLETED_TASKS_IS_TIME_DEPENDENT_ = (value) => {
    return [
        HIDE_COMPLETED_TASKS_['after-time-period'],
        HIDE_COMPLETED_TASKS_['after-specified-time']
    ].includes(value);
};

/**
 * Gets the source registry.
 *
 * @param {Gio.Cancellable} [cancellable] - Cancellable object.
 * @returns {Promise<EDataServer.SourceRegistry>} Source registry.
 */
export function getSourceRegistry_(cancellable = null) {
    return new Promise((resolve, reject) => {
        EDataServer.SourceRegistry.new(cancellable, (_registry, res) => {
            try {
                resolve(EDataServer.SourceRegistry.new_finish(res));
            } catch (e) {
                reject(e);
            }
        });
    });
}

/**
 * Gets the interface to access and modify calendar sources (including task
 * lists).
 *
 * @param {EDataServer.Source} source - Data source.
 * @param {ECal.ClientSourceType} type - Source type of the calendar.
 * @param {number} wait - Timeout, in seconds, to wait for the backend to be
 * fully connected.
 * @param {Gio.Cancellable} [cancellable] - Cancellable object.
 * @returns {Promise<ECal.Client>} `ECal.Client` of the source.
 */
export function getECalClient_(source, type, wait, cancellable = null) {
    return new Promise((resolve, reject) => {
        ECal.Client.connect(source, type, wait, cancellable, (_source, res) => {
            try {
                resolve(ECal.Client.connect_finish(res));
            } catch (e) {
                reject(e);
            }
        });
    });
}

/**
 * Gets the interface to receive notifications on calendar sources (including
 * task lists).
 *
 * @param {ECal.Client} client - `ECal.Client` of the source.
 * @param {string} query - An S-expression representing the query.
 * @param {Gio.Cancellable} [cancellable] - Cancellable object.
 * @returns {Promise<ECal.ClientView>} `ECal.ClientView` of the source.
 */
export function getECalClientView_(client, query, cancellable = null) {
    return new Promise((resolve, reject) => {
        client.get_view(query, cancellable, (self, res) => {
            try {
                resolve(self.get_view_finish(res)[1]);
            } catch (e) {
                reject(e);
            }
        });
    });
}

/**
 * Refreshes collection backend for a source. In case of task lists, this
 * would refresh the account those task lists belong to, to retrieve, delete or
 * change remote task lists.
 *
 * @param {ECal.SourceRegistry} registry - Source registry
 * @param {str} uid - UID of a collection source whose backend to refresh.
 * @param {Gio.Cancellable} [cancellable] - Cancellable object.
 * @returns {Promise<boolean>} `true` if no errors occurred.
 */
export function refreshBackend_(registry, uid, cancellable = null) {
    return new Promise((resolve, reject) => {
        registry.refresh_backend(uid, cancellable, (self, res) => {
            try {
                resolve(self.refresh_backend_finish(res));
            } catch (e) {
                reject(e);
            }
        });
    });
}

/**
 * Refreshes a source. In case of task lists, this would refresh its task
 * content.
 *
 * @param {EDataServer.Client} client - `EDataServer.Client` of a source.
 * @param {Gio.Cancellable} [cancellable] - Cancellable object.
 * @returns {Promise<boolean>} `true` if no errors occurred.
 */
export function refreshClient_(client, cancellable = null) {
    return new Promise((resolve, reject) => {
        client.refresh(cancellable, (self, res) => {
            try {
                resolve(self.refresh_finish(res));
            } catch (e) {
                reject(e);
            }
        });
    });
}

/**
 * Gets a list of objects from the calendar that match the specified query. In
 * the case of task lists, this would get the tasks of a given task list.
 *
 * @param {ECal.Client} client - `ECal.Client` of a source.
 * @param {str} query - An S-expression representing the query.
 * @param {Gio.Cancellable} [cancellable] - Cancellable object.
 * @returns {Promise<ECal.Component[]>} A list of objects.
 */
export function getTasks_(client, query, cancellable = null) {
    return new Promise((resolve, reject) => {
        client.get_object_list_as_comps(query, cancellable, (self, res) => {
            try {
                resolve(self.get_object_list_as_comps_finish(res)[1]);
            } catch (e) {
                reject(e);
            }
        });
    });
}

/**
 * Requests the calendar backend to modify existing objects. In the case of
 * task lists, this would modify given tasks.
 *
 * @param {ECal.Client} client - `ECal.Client` of a source.
 * @param {ICalGLib.Component[]} obj - Components to modify.
 * @param {ECal.ObjModType} mod - Type of modification.
 * @param {int} flag - bit-or of `ECal.OperationFlags`.
 * @param {Gio.Cancellable} [cancellable] - Cancellable object.
 * @returns {Promise<boolean>} `true` if no errors occurred.
 */
export function modifyObjects_(client, obj, mod, flag, cancellable = null) {
    return new Promise((resolve, reject) => {
        client.modify_objects(obj, mod, flag, cancellable, (self, res) => {
            try {
                resolve(self.modify_objects_finish(res));
            } catch (e) {
                reject(e);
            }
        });
    });
}

/**
 * Sorts task lists according to the given order of their uids. If task list
 * uid is not in the list, move it to the end of the list.
 *
 * @param {string[]} order - A list of task list uids.
 * @param {object} a - Task list object.
 * @param {object} b - Task list object.
 * @returns {int} Negative, zero or positive value to facilitate sorting.
 */
export function customSort_(order, a, b) {
    if (order.indexOf(a.uid) === -1) return 1;

    if (order.indexOf(b.uid) === -1) return -1;

    return order.indexOf(a.uid) - order.indexOf(b.uid);
}

/**
 * Sorts tasks by their name.
 *
 * @param {ECal.Component[]} a - A list consisting of task objects.
 * @param {ECal.Component[]} b - A list consisting of task objects.
 * @returns {int} Negative, zero or positive value to facilitate sorting.
 */
export function sortByName_(a, b) {
    const lc = (x) => x.get_summary().get_value().toLowerCase();

    if (a.get_summary() === null) return 1;

    if (b.get_summary() === null) return -1;

    return lc(a).localeCompare(lc(b));
}

/**
 * Sorts tasks by their due date. If a task has no due date, move it to the
 * end of the list.
 *
 * @param {ECal.Component[]} a - A list consisting of task objects.
 * @param {ECal.Component[]} b - A list consisting of task objects.
 * @returns {int} Negative, zero or positive value to facilitate sorting.
 */
export function sortByDueDate_(a, b) {
    const time = (x) => x.get_due().get_value().as_timet();

    if (a.get_due() === null && b.get_due() === null)
        return sortByPriority_(a, b);

    if (b.get_due() === null) return -1;

    if (a.get_due() === null) return 1;

    return time(a) - time(b);
}

/**
 * Sorts tasks by their priority. If a task has no priority, move it to the
 * end of the list.
 *
 * @param {ECal.Component[]} a - A list consisting of task objects.
 * @param {ECal.Component[]} b - A list consisting of task objects.
 * @returns {int} Negative, zero or positive value to facilitate sorting.
 */
export function sortByPriority_(a, b) {
    const priority = (x) => x.get_priority();

    if (priority(a) < 1 && priority(b) < 1) return sortByName_(a, b);

    if (priority(b) < 1) return -1;

    if (priority(a) < 1) return 1;

    return priority(a) - priority(b);
}

/**
 * Requests an asynchronous write of bytes into the stream.
 *
 * @param {Gio.OutputStream} output - Stream to write bytes to.
 * @param {ByteArray} bytes - The bytes to write.
 * @param {number} priority - The io priority of the request.
 * @param {Gio.Cancellable} [cancellable] - Cancellable object.
 * @returns {Promise<number>} Number of bytes written to the stream.
 */
export function writeBytesAsync_(output, bytes, priority, cancellable = null) {
    return new Promise((resolve, reject) => {
        output.write_bytes_async(bytes, priority, cancellable, (file, res) => {
            try {
                resolve(file.write_bytes_finish(res));
            } catch (e) {
                reject(e);
            }
        });
    });
}

/**
 * Waits for the subprocess to terminate and checks its exit status.
 *
 * @param {Gio.Subprocess} process - Process.
 * @param {Gio.Cancellable} [cancellable] - Cancellable object.
 * @returns {Promise<boolean>} `true` if successful.
 */
export function waitCheckAsync_(process, cancellable = null) {
    return new Promise((resolve, reject) => {
        process.wait_check_async(cancellable, (self, result) => {
            try {
                if (!self.wait_check_finish(result)) {
                    const status = self.get_exit_status();

                    throw new Gio.IOErrorEnum({
                        code: Gio.io_error_from_errno(status),
                        message: GLib.strerror(status)
                    });
                }

                resolve();
            } catch (e) {
                reject(e);
            }
        });
    });
}

/**
 * A simple debounce function. Returns a function, that, as long as it
 * continues to be invoked, will not be triggered. The function will be called
 * after it stops being called for `wait` milliseconds.
 *
 * @param {Function} func - Function to debounce.
 * @param {string} id - Function id.
 * @param {number} wait - Milliseconds to wait before calling the function.
 * @param {boolean} [immediate] - If true, trigger the function on the
 * leading edge, instead of the trailing.
 * @returns {Function} The `func` function with all its arguments.
 */
export function debounce_(func, id, wait, immediate = false) {
    return (...args) => {
        const later = () => {
            GLib.source_remove(_debounceTimeoutIds.get(id));
            _debounceTimeoutIds.delete(id);

            if (!immediate) func(...args);
        };

        if (_debounceTimeoutIds.get(id))
            GLib.source_remove(_debounceTimeoutIds.get(id));

        _debounceTimeoutIds.set(
            id,
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, wait, later)
        );

        if (immediate && !_debounceTimeoutIds.get(id)) func(...args);
    };
}

/**
 * Removes any remaining timeouts created by the `debounce_` function.
 */
export function removeDebounceTimeouts_() {
    if (_debounceTimeoutIds.size)
        _debounceTimeoutIds.keys().forEach((id) => GLib.source_remove(id));
}
