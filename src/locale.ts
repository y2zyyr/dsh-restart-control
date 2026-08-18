// src/locale.ts
// Plugin-owned locale dictionaries (zh-CN + en). Core locale files are never
// touched. Keys: General-settings row copy + native confirm dialog copy.
export const LOCALE_NS = 'dsh-restart-button'; // stable locale namespace (loader id), independent of npm package name

export const zh = {
  'title': '重启 DSH',
  'description': '重新启动 DSH Desktop 应用',
  'button': '重启 DSH',
  'button.restarting': '正在重启…',
  'busy.warning': '当前仍有任务正在运行，重启会中断正在执行的任务。',
  'busy.supported': 'DSH Desktop 将关闭并重新启动。正在运行的任务或未完成操作可能会中断。',
  'busy.unsupported': '当前环境未提供 DSH Desktop 重启能力，按钮已禁用。',
  'dialog.title': '重启 DSH？',
  'dialog.description': 'DSH Desktop 将关闭并重新启动。正在运行的任务或未完成操作可能会中断。',
  'dialog.confirm': '重启',
  'dialog.cancel': '取消',
  'error.failed': '重启请求失败，请重试。',
};

export const en = {
  'title': 'Restart DSH',
  'description': 'Restart the DSH Desktop application',
  'button': 'Restart DSH',
  'button.restarting': 'Restarting…',
  'busy.warning': 'Tasks are still running; restarting will interrupt them.',
  'busy.supported': 'DSH Desktop will close and relaunch. Running tasks or unfinished work may be interrupted.',
  'busy.unsupported': 'The restart capability is not available in this environment; the button is disabled.',
  'dialog.title': 'Restart DSH?',
  'dialog.description': 'DSH Desktop will close and relaunch. Running tasks or unfinished work may be interrupted.',
  'dialog.confirm': 'Restart',
  'dialog.cancel': 'Cancel',
  'error.failed': 'Restart request failed. Please try again.',
};