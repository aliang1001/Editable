import React, { useEffect } from 'react'
import './Editable.scss'
import { Table, Form, Input } from 'antd'
import Context from '../Context'

type FormProps = {
  getFieldDecorator: (
    arg0: any,
    arg1: { rules: { required: boolean; message: string }[]; initialValue: any }
  ) => (arg0: JSX.Element) => React.ReactNode

  validateFields: (f: (error: { [x: string]: any }, values: any) => void) => void
}
const EditableContext = React.createContext<FormProps | null>(null)

const EditableRow = ({ form, index, ...props }: any) => (
  <EditableContext.Provider value={form}>
    <tr {...props} />
  </EditableContext.Provider>
)

const EditableFormRow = Form.create()(EditableRow)

interface EditableCellType {
  record: any
  handleSave: Function
  dataIndex: string
  title: string
  editable: Boolean
  index: number
}

const EditableCell: React.FC<EditableCellType> = props => {
  const { editable, dataIndex, title, record, handleSave, children, ...restProps } = props

  const [editing, setEditing] = React.useState(false)
  const inputRef = React.useRef<Input>()

  React.useEffect(() => {
    if (editing) {
      inputRef.current && inputRef.current.focus()
    }
  }, [editing])

  const toggleEdit = React.useCallback(() => setEditing(!editing), [editing])

  const form = React.useContext(EditableContext)
  if (!form) {
    throw new Error('Unexpected case.')
  }

  const save = React.useCallback(
    (e: React.SyntheticEvent) => {
      console.log(1)
      form.validateFields((error, values) => {
        if (error && error[e.currentTarget.id]) {
          return
        }
        toggleEdit()
        const list = Object.entries(values)
        if (list.length < 1) {
          throw new Error('Expect one changed entry.')
        }
        const [key, value] = list[0]
        handleSave(record.key, key, value)
      })
    },
    [form, handleSave, record, toggleEdit]
  )

  const content: React.ReactNode = (() => {
    if (!editable) {
      return props.children
    }

    if (!editing) {
      return (
        <div className={'editable-cell-value-wrap'} style={{ paddingRight: 24 }} onClick={toggleEdit}>
          {children}
        </div>
      )
    }

    const decorate = form.getFieldDecorator(dataIndex, {
      rules: [{ required: true, message: `${title} is required.` }],
      initialValue: record[dataIndex]
    })
    const input = <Input ref={node => (inputRef.current = node || undefined)} onPressEnter={save} onBlur={save} />
    const decorated = decorate(input)

    return <Form.Item style={{ margin: 0 }}>{decorated}</Form.Item>
  })()

  return <td {...restProps}>{content}</td>
}

type EditableTableType = {
  dataSource: any[]
  columns: any[]
  uuid: any
  editable: boolean | undefined
}
const EditableTable: React.FC<EditableTableType> = React.memo(props => {
  const { dataSource, uuid } = props
  const workspace = React.useContext(Context.workspace)

  const handleSave = React.useCallback(
    (row: number, columnName: string, newValue: string) => {
      workspace.updateRow(uuid, row, columnName, newValue)
    },
    [dataSource, uuid, workspace]
  )

  const components = {
    body: {
      row: EditableFormRow,
      cell: EditableCell
    }
  }
  const columns = props.columns.map((col: { editable: Boolean; dataIndex: string; title: string }) => {
    if (!col.editable) {
      return col
    }
    return {
      ...col,
      onCell: (record: any) => ({
        record,
        editable: col.editable,
        dataIndex: col.dataIndex,
        title: col.title,
        handleSave: handleSave
      })
    }
  })

  return (
    <div className='ant-table-div'>
      <Table components={components} className='no-hover' bordered dataSource={dataSource} columns={columns} />
    </div>
  )
})

export default EditableTable
