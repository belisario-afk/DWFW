const fab = document.getElementById('fab') as HTMLButtonElement | null
const dock = document.getElementById('dock') as HTMLDivElement | null
const dockMin = document.getElementById('dockMin') as HTMLButtonElement | null

let open = false
let minimized = false
let idleTimer: number | null = null

function openDock() {
  if (!dock) return
  open = true
  dock.classList.remove('hidden')
  requestAnimationFrame(() => dock.classList.add('open'))
  scheduleIdle()
}
function closeDock() {
  if (!dock) return
  open = false
  dock.classList.remove('open')
  setTimeout(() => { if (!open) dock.classList.add('hidden') }, 180)
}
function toggleDock() { open ? closeDock() : openDock() }
function toggleMin() {
  if (!dock) return
  minimized = !minimized
  dock.classList.toggle('min', minimized)
  if (!minimized) scheduleIdle()
}
function scheduleIdle() {
  if (!dock) return
  if (idleTimer) window.clearTimeout(idleTimer)
  idleTimer = window.setTimeout(() => {
    if (open) minimized = true, dock.classList.add('min')
  }, 3500)
}
function cancelIdle() {
  if (!dock) return
  if (idleTimer) { window.clearTimeout(idleTimer); idleTimer = null }
  minimized = false
  dock.classList.remove('min')
}

fab?.addEventListener('click', toggleDock)
dockMin?.addEventListener('click', toggleMin)
dock?.addEventListener('mouseenter', cancelIdle)
dock?.addEventListener('mousemove', scheduleIdle)
dock?.addEventListener('mouseleave', scheduleIdle)

document.addEventListener('click', (e) => {
  const t = e.target as HTMLElement
  if (!t?.classList?.contains('tab')) return
  document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'))
  t.classList.add('active')
  const key = t.dataset.tab
  document.querySelectorAll('#dock .dock-body section').forEach(p => p.classList.add('hidden'))
  const page = document.getElementById('tab-' + key)
  if (page) page.classList.remove('hidden')
})