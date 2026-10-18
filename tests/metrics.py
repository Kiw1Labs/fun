"""Métricas do processo de teste. Nunca incluído no runtime público."""
import os
import time


def metrics():
    if os.name == 'nt':
        import ctypes
        from ctypes import wintypes

        class Memory(ctypes.Structure):
            _fields_ = [('cb', wintypes.DWORD), ('faults', wintypes.DWORD)] + [(name, ctypes.c_size_t) for name in ('peak', 'rss', 'qpp', 'qp', 'qnp', 'qn', 'pf', 'ppf')]

        data = Memory()
        data.cb = ctypes.sizeof(data)
        get_process = ctypes.windll.kernel32.GetCurrentProcess
        get_process.restype = wintypes.HANDLE
        get_memory = ctypes.windll.psapi.GetProcessMemoryInfo
        get_memory.argtypes = [wintypes.HANDLE, ctypes.POINTER(Memory), wintypes.DWORD]
        if not get_memory(get_process(), ctypes.byref(data), data.cb):
            raise OSError('Não foi possível medir RSS.')
        rss = data.rss
    else:
        from pathlib import Path
        rss = int(Path('/proc/self/statm').read_text().split()[1]) * os.sysconf('SC_PAGE_SIZE')
    return {'rss_mib': round(rss / 1024 / 1024, 2), 'cpu_seconds': time.process_time(), 'pid': os.getpid()}
