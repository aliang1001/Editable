import React from 'react'
import { NativeTypes } from 'react-dnd-html5-backend'
import { useDrop, DropTargetMonitor } from 'react-dnd'

import './Database.scss'

import Context from '../Context'
import * as Types from '../Model/Workspace'

export interface TargetBoxProps {
  onDrop: (props: TargetBoxProps, monitor: DropTargetMonitor) => void
}

const TargetBox: React.FC<TargetBoxProps> = props => {
  const { onDrop } = props
  const [{ canDrop, isOver }, drop] = useDrop({
    accept: [NativeTypes.FILE],
    drop(item, monitor) {
      if (onDrop) {
        onDrop(props, monitor)
      }
    },
    collect: monitor => ({
      isOver: monitor.isOver,
      canDrop: monitor.canDrop
    })
  })

  const isActive = canDrop && isOver
  return (
    <div ref={drop} className={'db-filedrop'}>
      {isActive ? 'Release to drop' : 'Drag a CSV here'}
    </div>
  )
}

function useTableList() {
  const workspace = React.useContext(Context.workspace)
  const [list, setList] = React.useState<Types.ResourceMetadata[] | null>(null)

  React.useEffect(() => {
    workspace.readTableList().then(result => {
      setList(result)
    })
  }, [workspace])

  return list
}

function FilterListCreator() {
  const workspace = React.useContext(Context.workspace)
  const list = useTableList()
  const [choice, setChoice] = React.useState<string | undefined>(undefined)
  const handleChange = React.useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    setChoice(event.target.value)
  }, [])
  const createFilterTable = React.useCallback(() => {
    if (!choice) {
      return
    }
    workspace.insertFilterTable(choice)
  }, [choice, workspace])

  return (
    <React.Fragment>
      <select value={choice} onChange={handleChange}>
        <option>请选择</option>
        {list &&
          list.map(item => {
            return <option value={item.uuid}>{item.title}</option>
          })}
      </select>
      <button onClick={createFilterTable}>创建</button>
    </React.Fragment>
  )
}

export function Database() {
  const workspace = React.useContext(Context.workspace)

  const onDrop = (props: TargetBoxProps, monitor: DropTargetMonitor) => {
    if (!monitor) {
      return
    }

    const files = monitor.getItem().files
    for (const file of files) {
      if (file.type !== 'text/csv') {
        continue
      }

      const reader = new FileReader()
      reader.onload = (e: any) => {
        workspace.insertCSV(e.target.result)
      }
      reader.readAsText(files[0])
    }
  }

  return (
    <div>
      <h1>Database</h1>
      <p>将 CSV 文件拖动至下方创建新的表格。</p>
      <TargetBox onDrop={onDrop} />
      <p>或者选择一个现有的表格建立过滤器。</p>
      <FilterListCreator />
    </div>
  )
}
