import React, { useMemo } from 'react'
import './Table.scss'
import EditableTable from './EditableTable'
import Context from '../Context'
import * as Types from '../Model/Workspace'

const transformsDataSource = (data: Types.StaticTable): any[] => {
  let result = []
  let count = 0
  for (let row of data.rows) {
    let obj: any = {}
    row.forEach((val: string, index: number) => {
      obj[data.columns[index]] = val
    })
    obj.key = count
    count++
    result.push(obj)
  }
  return result
}

const transfromDataColumns = (data: Types.StaticTable): any[] => {
  return data.columns.map(column => {
    return {
      title: column,
      dataIndex: column,
      editable: data.editable
    }
  })
}

export const Sheet: React.FC<{ data: Types.StaticTable }> = React.memo(({ data }) => {
  const sourceData = useMemo(() => transformsDataSource(data), [data])
  const columns = useMemo(() => transfromDataColumns(data), [data])
  return <EditableTable dataSource={sourceData} columns={columns} uuid={data.uuid} editable={data.editable} />
})

const FilterPanel: React.FC<{ uuid: string; table: Types.FilterTable; resolved: Types.StaticTable }> = ({
  uuid,
  table,
  resolved
}) => {
  const workspace = React.useContext(Context.workspace)
  const columns = resolved.columns
  const [choice, setChoice] = React.useState(columns[0])
  const [options, setOptions] = React.useState('')

  const handleChoiceChange = React.useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    setChoice(event.target.value)
  }, [])

  const handleInputChange = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setOptions(event.target.value)
  }, [])

  const insertCondition = React.useCallback(() => {
    let newData = Object.assign({}, table)
    const newCond: Types.FilterCondition = { column: choice, options: options.split(/\s+,\s+/g) }
    newData.conditions = [...table.conditions, newCond]
    workspace.updateTableData(uuid, newData)
  }, [workspace, choice, options, table, uuid])

  const deleteCondition = React.useCallback(
    (i: number) => () => {
      let newData = Object.assign({}, table)
      let conditions = table.conditions.slice(0, i).concat(table.conditions.slice(i + 1))
      newData.conditions = conditions
      workspace.updateTableData(uuid, newData)
    },
    [workspace, table, uuid]
  )

  return (
    <React.Fragment>
      <p>当前活跃的条件：</p>
      {table.conditions.map((condition, i) => {
        return (
          <React.Fragment key={i}>
            <p>{`${condition.column}：${condition.options.join('、')}`}</p>
            <button onClick={deleteCondition(i)}>点击删除</button>
          </React.Fragment>
        )
      })}
      <p>添加新的条件。</p>
      <select value={choice} onChange={handleChoiceChange}>
        {columns.map((x, index) => (
          <option key={index} value={x}>
            {x}
          </option>
        ))}
      </select>
      <input value={options} onChange={handleInputChange} />
      <button onClick={insertCondition}>添加</button>
    </React.Fragment>
  )
}

export function ControlledTable({ table }: { table: Types.Table }) {
  const workspace = React.useContext(Context.workspace)
  const uuid = table.metadata.uuid
  const editable = table.data.kind === 'filter' ? false : true
  const data = { ...table.resolved, uuid, editable }
  const [title, setTitle] = React.useState(table.metadata.title)
  const handleChange = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(event.target.value)
  }, [])
  const updateTitleInDB = React.useCallback(
    (event: any) => {
      if (title !== '') {
        workspace.updateTitle(table.metadata.uuid, title)
      }
    },
    [workspace, title, table.metadata.uuid]
  )

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const el = event.target as HTMLInputElement
    if (event.key === 'Enter') {
      el.blur()
    }
  }

  return (
    <div>
      <input
        className={'table-header'}
        value={title}
        placeholder='Untitled'
        onKeyDown={handleKeyDown}
        onChange={handleChange}
        onBlur={updateTitleInDB}
      />
      {table.data.kind === 'filter' && (
        <FilterPanel uuid={table.metadata.uuid} table={table.data} resolved={table.resolved} />
      )}
      <Sheet data={data} />
    </div>
  )
}

type AsyncResource<Value> = 'loading' | 'notfound' | Value
type AsyncTable = AsyncResource<Types.Table>

function useTable(uuid: string) {
  const workspace = React.useContext(Context.workspace)
  const [table, setTable] = React.useState<AsyncTable>('loading')

  const fetchTable = React.useCallback(async () => {
    const result = await workspace.readTable(uuid)
    if (!result) {
      setTable('notfound')
    } else {
      setTable(result)
    }
  }, [workspace, uuid])

  React.useEffect(() => {
    fetchTable()
    workspace.observe(uuid, fetchTable)
    return () => workspace.unobserve(uuid, fetchTable)
  }, [workspace, uuid, fetchTable /* make linter happy */])
  return table
}

export function TablePage({ match }: any) {
  return <Table uuid={match.params.id} key={match.params.id} />
}

function Table({ uuid }: { uuid: string }) {
  const table = useTable(uuid)
  if (table === 'loading') {
    return <p>Loading table.</p>
  }

  if (table === 'notfound') {
    return <p>{`Cannot find table ${uuid}`}</p>
  }
  return <ControlledTable table={table} />
}
