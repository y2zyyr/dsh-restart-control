// internal build shim: expose client plugin body to the loader wrapper.
import { apply, inject } from './index';
self.__dsh_restart_control_entry__ = { apply, inject };
