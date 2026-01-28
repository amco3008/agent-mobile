import { memo, useState } from 'react'
import { useContainers } from '../../api/hooks/useContainers'
import { ContainerCard } from './ContainerCard'

export const ContainerGrid = memo(function ContainerGrid() {
  const { data: containers, isLoading, error } = useContainers()
  const [selectedContainer, setSelectedContainer] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-500">
        <div className="animate-spin w-6 h-6 border-2 border-signal-yellow border-t-transparent rounded-full" />
        <span className="ml-2">Loading containers...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 bg-signal-red/10 border border-signal-red/30 rounded-lg text-signal-red">
        Error loading containers: {error.message}
      </div>
    )
  }

  if (!containers?.length) {
    return (
      <div className="p-4 bg-factory-panel border border-factory-border rounded-lg text-gray-400 text-center">
        <div className="text-lg mb-2">No agent-mobile containers found</div>
        <div className="text-xs">
          Containers with image containing "agent-mobile" or label "com.rts.type=agent" will appear here
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {containers.map((container) => (
        <ContainerCard
          key={container.id}
          container={container}
          isSelected={selectedContainer === container.id}
          onSelect={() =>
            setSelectedContainer(
              selectedContainer === container.id ? null : container.id
            )
          }
        />
      ))}
    </div>
  )
})
