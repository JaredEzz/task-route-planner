import { useState, useMemo, useCallback } from 'react'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import tasks from './tasks.json'
import './App.css'

type Tier = 'Easy' | 'Medium' | 'Hard' | 'Elite' | 'Master'

interface Task {
  id: number
  name: string
  description: string
  tier: string
  region: string
  points: number
  requirements?: string
  other?: string
}

const TIER_COLORS: Record<string, string> = {
  Easy: '#2ecc71',
  Medium: '#f1c40f',
  Hard: '#e74c3c',
  Elite: '#9b59b6',
  Master: '#e67e22',
}

const SELECTABLE_REGIONS = ['Asgarnia', 'Desert', 'Kandarin', 'Kourend', 'Tirannwn', 'Wilderness']
const TOGGLEABLE_REGIONS = ['Varlamore', 'Karamja']
const MAX_EXTRA_REGIONS = 3

const ALL_REGIONS = ['Asgarnia', 'Desert', 'General', 'Kandarin', 'Karamja', 'Kourend', 'Tirannwn', 'Varlamore', 'Wilderness']
const ALL_TIERS = ['Easy', 'Medium', 'Hard', 'Elite', 'Master']
const ALL_SKILLS = [
  'Agility', 'Attack', 'Construction', 'Cooking', 'Crafting', 'Defence',
  'Farming', 'Firemaking', 'Fishing', 'Fletching', 'Herblore', 'Hitpoints',
  'Hunter', 'Magic', 'Mining', 'Prayer', 'Ranged', 'Runecraft',
  'Slayer', 'Smithing', 'Strength', 'Thieving', 'Woodcutting',
]

function getAutocomplete(input: string): Array<{ display: string, filter: { key: string, value: string } }> {
  if (input.length < 3) return []
  const lower = input.toLowerCase()
  const suggestions: Array<{ display: string, filter: { key: string, value: string } }> = []

  for (const r of ALL_REGIONS) {
    if (r.toLowerCase().startsWith(lower) || r.toLowerCase().includes(lower)) {
      suggestions.push({ display: `region: ${r.toLowerCase()}`, filter: { key: 'region', value: r.toLowerCase() } })
    }
  }
  for (const t of ALL_TIERS) {
    if (t.toLowerCase().startsWith(lower)) {
      suggestions.push({ display: `tier: ${t.toLowerCase()}`, filter: { key: 'tier', value: t.toLowerCase() } })
    }
  }
  for (const s of ALL_SKILLS) {
    if (s.toLowerCase().startsWith(lower) || s.toLowerCase().includes(lower)) {
      suggestions.push({ display: `req: ${s.toLowerCase()}`, filter: { key: 'req', value: s.toLowerCase() } })
    }
  }
  return suggestions.slice(0, 3)
}

// Relic unlock thresholds (points) - update these when Jagex changes them
const RELIC_THRESHOLDS = [0, 750, 1500, 2500, 5000, 8000, 16000, 25000]

// Region unlock thresholds (task count) - update these when Jagex changes them
const REGION_THRESHOLDS = [20, 100, 200, 400]

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const TIERS: (Tier | 'All')[] = ['All', 'Easy', 'Medium', 'Hard', 'Elite', 'Master']

function SortableRouteItem({ task, index, isCompleted, onToggleComplete, onRemove }: {
  task: Task, index: number, isCompleted: boolean,
  onToggleComplete: (id: number) => void, onRemove: (id: number) => void,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.8 : isCompleted ? 0.6 : 1,
  }

  return (
    <div ref={setNodeRef} style={{
      ...style,
      display: 'flex', alignItems: 'center', gap: '0.5rem',
      padding: '0.4rem 0.6rem', borderRadius: 6,
      background: isDragging ? '#2a2a4e' : isCompleted ? '#1a3a2a' : '#1a1a2e',
    }}>
      <span style={{ color: '#666', fontSize: '0.75rem', minWidth: 20, textAlign: 'right' }}>
        {index + 1}.
      </span>
      <input
        type="checkbox"
        checked={isCompleted}
        onChange={() => onToggleComplete(task.id)}
        style={{ width: 16, height: 16, cursor: 'pointer' }}
      />
      <span style={{
        padding: '1px 6px', borderRadius: 3, fontSize: '0.65rem', fontWeight: 'bold',
        color: '#fff', background: TIER_COLORS[task.tier] || '#888',
      }}>
        {task.tier}
      </span>
      <span style={{ fontSize: '0.65rem', color: '#666', minWidth: 70 }}>{task.region}</span>
      <div style={{ flex: 1 }}>
        <div style={{
          color: '#ddd', fontSize: '0.85rem',
          textDecoration: isCompleted ? 'line-through' : 'none',
        }}>
          {task.name}
        </div>
        {(task.requirements || task.other) && (
          <div style={{ fontSize: '0.65rem', color: '#e67e22', marginTop: 1 }}>
            {task.requirements && <span>Req: {task.requirements}</span>}
            {task.requirements && task.other && <span> | </span>}
            {task.other && <span>Items: {task.other}</span>}
          </div>
        )}
      </div>
      <span style={{ fontSize: '0.75rem', color: '#888' }}>{task.points} pts</span>
      <button onClick={() => onRemove(task.id)}
        style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: '1rem', padding: '0 4px', fontWeight: 'bold' }}>
        x
      </button>
      <div {...attributes} {...listeners}
        style={{
          cursor: isDragging ? 'grabbing' : 'grab',
          padding: '0.25rem 0.4rem',
          color: '#555',
          fontSize: '1rem',
          userSelect: 'none',
          touchAction: 'none',
        }}
      >
        ⠿
      </div>
    </div>
  )
}

function App() {
  const [filterInput, setFilterInput] = useState('')
  const [filters, setFilters] = useState<Array<{ key: string, value: string }>>([])
  const [showAutocomplete, setShowAutocomplete] = useState(false)
  const autocompleSuggestions = useMemo(() => getAutocomplete(filterInput), [filterInput])

  const handleFilterSubmit = useCallback(() => {
    const input = filterInput.trim().toLowerCase()
    if (!input) return

    const colonIdx = input.indexOf(':')
    if (colonIdx > 0) {
      const key = input.slice(0, colonIdx).trim()
      const value = input.slice(colonIdx + 1).trim()
      if (key && value) {
        setFilters(prev => [...prev, { key, value }])
        setFilterInput('')
        return
      }
    }
    // Plain text = text search filter
    setFilters(prev => [...prev, { key: 'text', value: input }])
    setFilterInput('')
  }, [filterInput])

  const removeFilter = useCallback((index: number) => {
    setFilters(prev => prev.filter((_, i) => i !== index))
  }, [])

  const applyAutocomplete = useCallback((filter: { key: string, value: string }) => {
    setFilters(prev => [...prev, filter])
    setFilterInput('')
    setShowAutocomplete(false)
  }, [])
  const [showGeneral, setShowGeneral] = useState(() => {
    const saved = localStorage.getItem('show-general')
    return saved !== null ? JSON.parse(saved) : true
  })
  const [toggledRegions, setToggledRegions] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('toggled-regions')
    return saved ? new Set(JSON.parse(saved)) : new Set(['Varlamore'])
  })
  const [extraRegions, setExtraRegions] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('extra-regions')
    return saved ? new Set(JSON.parse(saved)) : new Set()
  })
  const [completed, setCompleted] = useState<Set<number>>(() => {
    const saved = localStorage.getItem('completed-tasks')
    return saved ? new Set(JSON.parse(saved)) : new Set()
  })
  const [route, setRoute] = useState<number[]>(() => {
    const saved = localStorage.getItem('task-route')
    return saved ? JSON.parse(saved) : []
  })
  const [showCompleted] = useState(true)
  const [activeTab, setActiveTab] = useState<'tasks' | 'route' | 'json'>('tasks')

  const allTasks = tasks as Task[]
  const taskMap = useMemo(() => {
    const m = new Map<number, Task>()
    allTasks.forEach(t => m.set(t.id, t))
    return m
  }, [allTasks])

  const routeSet = useMemo(() => new Set(route), [route])

  const toggleToggledRegion = (region: string) => {
    setToggledRegions(prev => {
      const next = new Set(prev)
      if (next.has(region)) next.delete(region)
      else next.add(region)
      localStorage.setItem('toggled-regions', JSON.stringify(Array.from(next)))
      return next
    })
  }

  const activeRegions = useMemo(() => {
    const regions = new Set<string>()
    if (showGeneral) regions.add('General')
    toggledRegions.forEach(r => regions.add(r))
    extraRegions.forEach(r => regions.add(r))
    return regions
  }, [showGeneral, toggledRegions, extraRegions])

  const toggleExtraRegion = (region: string) => {
    setExtraRegions(prev => {
      const next = new Set(prev)
      if (next.has(region)) {
        next.delete(region)
      } else if (next.size < MAX_EXTRA_REGIONS) {
        next.add(region)
      }
      localStorage.setItem('extra-regions', JSON.stringify(Array.from(next)))
      return next
    })
  }

  const filtered = useMemo(() => {
    return allTasks.filter(t => {
      if (routeSet.has(t.id)) return false
      if (!activeRegions.has(t.region)) return false
      if (!showCompleted && completed.has(t.id)) return false

      // Group filters by type: same type = OR, different types = AND
      const grouped: Record<string, string[]> = {}
      for (const f of filters) {
        const key = f.key
        if (!grouped[key]) grouped[key] = []
        grouped[key].push(f.value.toLowerCase())
      }

      for (const [key, values] of Object.entries(grouped)) {
        const matchesAny = values.some(val => {
          switch (key) {
            case 'tier':
              return t.tier.toLowerCase() === val
            case 'region':
              return t.region.toLowerCase() === val
            case 'req':
              return ((t.requirements || '') + ' ' + (t.other || '')).toLowerCase().includes(val)
            case 'text':
            default:
              return t.name.toLowerCase().includes(val) ||
                t.description.toLowerCase().includes(val) ||
                (t.requirements && t.requirements.toLowerCase().includes(val))
          }
        })
        if (!matchesAny) return false
      }
      return true
    })
  }, [allTasks, activeRegions, filters, completed, showCompleted, routeSet])

  const toggleComplete = (id: number) => {
    setCompleted(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      localStorage.setItem('completed-tasks', JSON.stringify(Array.from(next)))
      return next
    })
  }

  const addToRoute = useCallback((id: number) => {
    setRoute(prev => {
      const next = [...prev, id]
      localStorage.setItem('task-route', JSON.stringify(next))
      return next
    })
  }, [])

  const removeFromRoute = useCallback((id: number) => {
    setRoute(prev => {
      const next = prev.filter(x => x !== id)
      localStorage.setItem('task-route', JSON.stringify(next))
      return next
    })
  }, [])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setRoute(prev => {
        const oldIndex = prev.indexOf(active.id as number)
        const newIndex = prev.indexOf(over.id as number)
        const next = arrayMove(prev, oldIndex, newIndex)
        localStorage.setItem('task-route', JSON.stringify(next))
        return next
      })
    }
  }, [])

  const routeTasks = route.map(id => taskMap.get(id)).filter(Boolean) as Task[]
  const routePoints = routeTasks.reduce((s, t) => s + t.points, 0)
  const routeCompleted = routeTasks.filter(t => completed.has(t.id)).length
  const routeEarnedPoints = routeTasks.filter(t => completed.has(t.id)).reduce((s, t) => s + t.points, 0)

  // Compute relic unlock positions in the route
  // For each task in order, track cumulative points and note where thresholds are crossed
  const routeWithMilestones = useMemo(() => {
    type MilestoneItem =
      | { type: 'task', task: Task, index: number, cumPoints: number }
      | { type: 'relic', threshold: number, relicNumber: number }
      | { type: 'region', threshold: number, regionNumber: number }

    const items: MilestoneItem[] = []
    let cumPoints = 0
    let nextRelicIdx = 0
    let nextRegionIdx = 0
    let taskCount = 0

    // Relic 1 unlocks at 0 pts
    while (nextRelicIdx < RELIC_THRESHOLDS.length && RELIC_THRESHOLDS[nextRelicIdx] <= 0) {
      items.push({ type: 'relic', threshold: 0, relicNumber: nextRelicIdx + 1 })
      nextRelicIdx++
    }

    for (let i = 0; i < routeTasks.length; i++) {
      cumPoints += routeTasks[i].points
      taskCount++

      // Task first, then milestones after it (the task that crosses the threshold triggers the unlock)
      items.push({ type: 'task', task: routeTasks[i], index: i, cumPoints })

      // Check relic thresholds (points-based)
      while (nextRelicIdx < RELIC_THRESHOLDS.length && cumPoints >= RELIC_THRESHOLDS[nextRelicIdx]) {
        items.push({ type: 'relic', threshold: RELIC_THRESHOLDS[nextRelicIdx], relicNumber: nextRelicIdx + 1 })
        nextRelicIdx++
      }

      // Check region thresholds (task-count-based)
      while (nextRegionIdx < REGION_THRESHOLDS.length && taskCount >= REGION_THRESHOLDS[nextRegionIdx]) {
        items.push({ type: 'region', threshold: REGION_THRESHOLDS[nextRegionIdx], regionNumber: nextRegionIdx + 1 })
        nextRegionIdx++
      }
    }

    return items
  }, [routeTasks])

  const filteredPoints = filtered.reduce((s, t) => s + t.points, 0)

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 960, margin: '0 auto', padding: '1rem' }}>
      <h1 style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
        OSRS Leagues VI - Task Route Planner
      </h1>

      {/* Region selector bar */}
      <div style={{
        background: '#1a1a2e',
        borderRadius: 10,
        padding: '0.75rem',
        marginBottom: '1rem',
      }}>
        <div style={{ fontSize: '0.75rem', color: '#aaa', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: 1 }}>
          Regions ({MAX_EXTRA_REGIONS - extraRegions.size} slots left)
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {/* General toggle */}
          <button
            onClick={() => { const next = !showGeneral; setShowGeneral(next); localStorage.setItem('show-general', JSON.stringify(next)) }}
            style={{
              padding: '0.4rem 0.75rem', borderRadius: 6,
              border: `2px solid ${showGeneral ? '#2ecc71' : '#555'}`,
              background: showGeneral ? '#2ecc71' : 'transparent',
              color: showGeneral ? '#fff' : '#aaa',
              fontWeight: 'bold', fontSize: '0.8rem', cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            General
          </button>

          <div style={{ width: 1, background: '#444', margin: '0 0.25rem' }} />

          {/* Toggleable regions (Varlamore, Karamja) - don't count toward the 3 */}
          {TOGGLEABLE_REGIONS.map(region => {
            const isOn = toggledRegions.has(region)
            return (
              <button
                key={region}
                onClick={() => toggleToggledRegion(region)}
                style={{
                  padding: '0.4rem 0.75rem', borderRadius: 6,
                  border: `2px solid ${isOn ? '#3498db' : '#555'}`,
                  background: isOn ? '#3498db' : 'transparent',
                  color: isOn ? '#fff' : '#aaa',
                  fontWeight: 'bold', fontSize: '0.8rem', cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                {region}
              </button>
            )
          })}

          <div style={{ width: 1, background: '#444', margin: '0 0.25rem' }} />
          {SELECTABLE_REGIONS.map(region => {
            const isSelected = extraRegions.has(region)
            const isDisabled = !isSelected && extraRegions.size >= MAX_EXTRA_REGIONS
            return (
              <button
                key={region}
                onClick={() => !isDisabled && toggleExtraRegion(region)}
                style={{
                  padding: '0.4rem 0.75rem', borderRadius: 6,
                  border: `2px solid ${isSelected ? '#e67e22' : '#555'}`,
                  background: isSelected ? '#e67e22' : 'transparent',
                  color: isSelected ? '#fff' : isDisabled ? '#444' : '#aaa',
                  fontWeight: isSelected ? 'bold' : 'normal',
                  fontSize: '0.8rem', cursor: isDisabled ? 'not-allowed' : 'pointer',
                  opacity: isDisabled ? 0.4 : 1, transition: 'all 0.15s',
                }}
              >
                {region}
              </button>
            )
          })}
        </div>
      </div>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 0, marginBottom: '1rem' }}>
        <button
          onClick={() => setActiveTab('tasks')}
          style={{
            flex: 1, padding: '0.6rem', border: 'none', cursor: 'pointer',
            fontWeight: 'bold', fontSize: '0.9rem', transition: 'all 0.15s',
            borderBottom: activeTab === 'tasks' ? '3px solid #3498db' : '3px solid transparent',
            background: activeTab === 'tasks' ? '#f0f7ff' : '#f5f5f5',
            color: activeTab === 'tasks' ? '#3498db' : '#888',
            borderRadius: '6px 0 0 0',
          }}
        >
          Tasks ({filtered.length})
        </button>
        <button
          onClick={() => setActiveTab('route')}
          style={{
            flex: 1, padding: '0.6rem', border: 'none', cursor: 'pointer',
            fontWeight: 'bold', fontSize: '0.9rem', transition: 'all 0.15s',
            borderBottom: activeTab === 'route' ? '3px solid #e67e22' : '3px solid transparent',
            background: activeTab === 'route' ? '#fff8f0' : '#f5f5f5',
            color: activeTab === 'route' ? '#e67e22' : '#888',
            borderRadius: 0,
          }}
        >
          My Route ({routeTasks.length} - {routePoints.toLocaleString()} pts)
        </button>
      </div>

      {/* Tasks tab */}
      {activeTab === 'tasks' && (
        <>

          <div style={{ marginBottom: '0.5rem' }}>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.4rem' }}>
              {filters.map((f, i) => {
                const chipColor: Record<string, string> = {
                  region: '#e67e22',
                  tier: '#9b59b6',
                  req: '#2ecc71',
                  text: '#3498db',
                }
                return (
                <span key={i} style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                  background: chipColor[f.key] || chipColor.text, color: '#fff', padding: '0.25rem 0.5rem',
                  borderRadius: 4, fontSize: '0.8rem',
                }}>
                  {f.key}: {f.value}
                  <span onClick={() => removeFilter(i)}
                    style={{ cursor: 'pointer', fontWeight: 'bold', opacity: 0.7, marginLeft: 2 }}>x</span>
                </span>
              )})}
            </div>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Filter tasks... (try region: varlamore, tier: easy, req: fishing, or just text)"
                value={filterInput}
                onChange={e => { setFilterInput(e.target.value); setShowAutocomplete(true) }}
                onFocus={() => setShowAutocomplete(true)}
                onBlur={() => setTimeout(() => setShowAutocomplete(false), 200)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    if (autocompleSuggestions.length > 0 && filterInput.length >= 3) {
                      applyAutocomplete(autocompleSuggestions[0].filter)
                    } else {
                      handleFilterSubmit()
                    }
                    e.preventDefault()
                  }
                  if (e.key === 'Tab' && autocompleSuggestions.length > 0 && filterInput.length >= 3) {
                    applyAutocomplete(autocompleSuggestions[0].filter)
                    e.preventDefault()
                  }
                  if (e.key === 'Escape') {
                    setShowAutocomplete(false)
                  }
                }}
                style={{ width: '100%', padding: '0.5rem', borderRadius: 6, border: '1px solid #ccc', fontSize: '0.9rem' }}
              />
              {showAutocomplete && autocompleSuggestions.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                  background: '#fff', border: '1px solid #ccc', borderTop: 'none',
                  borderRadius: '0 0 6px 6px', boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
                }}>
                  {autocompleSuggestions.map((s, i) => (
                    <div
                      key={i}
                      onMouseDown={() => applyAutocomplete(s.filter)}
                      style={{
                        padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem',
                        borderBottom: i < autocompleSuggestions.length - 1 ? '1px solid #eee' : 'none',
                        background: i === 0 ? '#f0f7ff' : '#fff',
                      }}
                    >
                      <span style={{ color: '#3498db', fontWeight: 'bold' }}>{s.filter.key}:</span>{' '}
                      <span>{s.filter.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ fontSize: '0.7rem', color: '#999', marginTop: '0.25rem' }}>
              region: name | tier: easy/medium/hard/elite/master | req: skill name (e.g. req: fishing) | or plain text. Enter/Tab to add top suggestion.
            </div>
          </div>

          <div style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.5rem' }}>
            {filtered.length} tasks available ({filteredPoints.toLocaleString()} pts)
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {filtered.map(task => (
              <div
                key={task.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                  padding: '0.5rem 0.75rem', borderRadius: 6,
                  border: '1px solid #e0e0e0', background: '#fff',
                  transition: 'all 0.15s',
                }}
              >
                <button
                  onClick={() => addToRoute(task.id)}
                  title="Add to route"
                  style={{
                    background: '#3498db', border: 'none', color: '#fff',
                    borderRadius: '50%', width: 24, height: 24, fontSize: '1rem',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, lineHeight: 1,
                  }}
                >
                  +
                </button>
                <span style={{
                  padding: '2px 8px', borderRadius: 4, fontSize: '0.7rem', fontWeight: 'bold',
                  color: '#fff', background: TIER_COLORS[task.tier] || '#888',
                  minWidth: 50, textAlign: 'center',
                }}>
                  {task.tier}
                </span>
                <span style={{ fontSize: '0.7rem', color: '#888', minWidth: 90 }}>{task.region}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{task.name}</div>
                  <div style={{ fontSize: '0.75rem', color: '#666' }}>{task.description}</div>
                  {(task.requirements || task.other) && (
                    <div style={{ fontSize: '0.7rem', color: '#e67e22', marginTop: 2 }}>
                      {task.requirements && <span>Req: {task.requirements}</span>}
                      {task.requirements && task.other && <span> | </span>}
                      {task.other && <span>Items: {task.other}</span>}
                    </div>
                  )}
                </div>
                <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#555' }}>
                  {task.points} pts
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Route tab */}
      {activeTab === 'route' && (
        <div style={{
          background: '#16213e',
          borderRadius: 10,
          padding: '0.75rem',
        }}>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', justifyContent: 'flex-end' }}>
            <button
              onClick={() => {
                const data = JSON.stringify({ route, completed: Array.from(completed) }, null, 2)
                const blob = new Blob([data], { type: 'application/json' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = 'leagues-route.json'
                a.click()
                URL.revokeObjectURL(url)
              }}
              style={{
                background: '#3498db', border: 'none', color: '#fff',
                padding: '0.3rem 0.6rem', borderRadius: 4, fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              Export Route
            </button>
            <label style={{
              background: '#2ecc71', color: '#fff',
              padding: '0.3rem 0.6rem', borderRadius: 4, fontSize: '0.75rem',
              cursor: 'pointer',
            }}>
              Import Route
              <input
                type="file"
                accept=".json"
                style={{ display: 'none' }}
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  const reader = new FileReader()
                  reader.onload = ev => {
                    try {
                      const data = JSON.parse(ev.target?.result as string)
                      if (data.route && Array.isArray(data.route)) {
                        setRoute(data.route)
                        localStorage.setItem('task-route', JSON.stringify(data.route))
                      }
                      if (data.completed && Array.isArray(data.completed)) {
                        setCompleted(new Set(data.completed))
                        localStorage.setItem('completed-tasks', JSON.stringify(data.completed))
                      }
                    } catch {
                      alert('Invalid route file')
                    }
                  }
                  reader.readAsText(file)
                  e.target.value = ''
                }}
              />
            </label>
          </div>
          {routeTasks.length === 0 && (
            <div style={{ color: '#555', fontSize: '0.85rem', padding: '1.5rem', textAlign: 'center' }}>
              No tasks in your route yet. Switch to the Tasks tab and click + to add some.
            </div>
          )}
          {routeCompleted > 0 && (
            <div style={{ color: '#2ecc71', fontSize: '0.85rem', marginBottom: '0.5rem', padding: '0 0.25rem' }}>
              {routeCompleted}/{routeTasks.length} done - {routeEarnedPoints.toLocaleString()} / {routePoints.toLocaleString()} pts earned
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={route} strategy={verticalListSortingStrategy}>
                {routeWithMilestones.map((item, i) => {
                  if (item.type === 'relic') {
                    return (
                      <div key={`relic-${item.relicNumber}`} style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.5rem 0.75rem', borderRadius: 6, margin: '0.25rem 0',
                        background: 'linear-gradient(90deg, #e67e22 0%, #f39c12 50%, #e67e22 100%)',
                        border: '2px solid #f39c12',
                      }}>
                        <span style={{ fontSize: '1.2rem' }}>🔓</span>
                        <span style={{ color: '#fff', fontWeight: 'bold', fontSize: '0.9rem', flex: 1 }}>
                          Relic {item.relicNumber} Unlock
                        </span>
                        <span style={{ color: '#fff', fontSize: '0.8rem', opacity: 0.9 }}>
                          {item.threshold.toLocaleString()} pts
                        </span>
                      </div>
                    )
                  }
                  if (item.type === 'region') {
                    return (
                      <div key={`region-${item.regionNumber}`} style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.5rem 0.75rem', borderRadius: 6, margin: '0.25rem 0',
                        background: 'linear-gradient(90deg, #3498db 0%, #2980b9 50%, #3498db 100%)',
                        border: '2px solid #2980b9',
                      }}>
                        <span style={{ fontSize: '1.2rem' }}>🗺</span>
                        <span style={{ color: '#fff', fontWeight: 'bold', fontSize: '0.9rem', flex: 1 }}>
                          Region {item.regionNumber} Unlock
                        </span>
                        <span style={{ color: '#fff', fontSize: '0.8rem', opacity: 0.9 }}>
                          {item.threshold} tasks
                        </span>
                      </div>
                    )
                  }
                  return (
                    <SortableRouteItem
                      key={item.task.id}
                      task={item.task}
                      index={item.index}
                      isCompleted={completed.has(item.task.id)}
                      onToggleComplete={toggleComplete}
                      onRemove={removeFromRoute}
                    />
                  )
                })}
              </SortableContext>
            </DndContext>
          </div>
        </div>
      )}

    </div>
  )
}

export default App
