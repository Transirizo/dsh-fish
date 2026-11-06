/**
 * client.js —— dsh-fish-v3 的客户端半边：在 Settings → Plugins 里注册大肥鱼的配置表单。
 *
 * 走宿主 configForms 服务（ctx.configForms.get(namespace)）读写本插件的 volatile Config，
 * 表单用纯 React + 自带控件，不引组件库。这是「设置里可改配置」的那一层。
 */
window.__ModuleLoader__.load({
  id: 'dsh-fish-v3',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement
    const useSyncExternalStore = React.useSyncExternalStore

    const name = 'dsh-fish-v3'
    const inject = ['slots', 'configForms']
    const NS = 'dsh-fish-v3'

    const SELECT_OPTIONS = {
      groupMode: [['quiet', '安静'], ['balanced', '平衡'], ['active', '活跃']],
      logLevel: [['debug', 'debug'], ['info', 'info'], ['warn', 'warn'], ['error', 'error']],
    }

    const FIELDS = [
      { key: 'groupMode', label: '群内节奏', type: 'select' },
      { key: 'sendingEnabled', label: '真实平台回复（默认关）', type: 'bool' },
      { key: 'netMaxQueriesPerHour', label: '联网每小时次数', type: 'number' },
      { key: 'netMaxConcurrent', label: '联网并发数', type: 'number' },
      { key: 'netMaxBytes', label: '联网体积上限（字节）', type: 'number' },
      { key: 'netTimeoutMs', label: '联网超时（毫秒）', type: 'number' },
      { key: 'logLevel', label: '日志级别', type: 'select' },
    ]

    const rowStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid rgba(128,128,128,0.18)' }
    const labelStyle = { fontSize: 13 }

    function FishSettings({ form }) {
      const snap = useSyncExternalStore(form.subscribe.bind(form), form.getSnapshot.bind(form))
      if (!snap || snap.status !== 'ready') return h('div', null, '配置加载中…')
      const v = snap.value ?? {}
      const writable = snap.writable
      return h('div', null,
        h('h3', { style: { margin: '0 0 6px' } }, '大肥鱼 · 环境参数'),
        FIELDS.map((f) => h('div', { key: f.key, style: rowStyle },
          h('span', { style: labelStyle }, f.label),
          renderControl(form, f, v[f.key], writable))),
        writable ? null : h('div', { style: { color: '#a33', fontSize: 12, marginTop: 8 } }, '当前 profile 不可写，配置只读。'),
      )
    }

    function renderControl(form, f, val, writable) {
      const disabled = !writable
      if (f.type === 'bool') {
        return h('input', { type: 'checkbox', checked: !!val, disabled, onChange: (e) => form.set(f.key, e.target.checked) })
      }
      if (f.type === 'select') {
        return h('select', { value: String(val ?? ''), disabled, onChange: (e) => form.set(f.key, e.target.value) },
          (SELECT_OPTIONS[f.key] || []).map(([v, t]) => h('option', { key: v, value: v }, t)))
      }
      return h('input', { type: 'number', value: val === undefined ? '' : val, disabled, onChange: (e) => form.set(f.key, Number(e.target.value)) })
    }

    function apply(ctx) {
      ctx.effect(() => ctx.configForms.whileServed([NS], () => ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: NS,
        order: 46,
        label: () => '大肥鱼',
        inject: () => ({ form: ctx.configForms.get(NS) }),
      }, FishSettings))), 'dsh-fish-v3.settings')
    }

    return { name, inject, apply }
  },
})
