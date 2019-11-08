import CSVParse from 'csv-parse'
import UUID from 'uuid/v4'

import { openDB, DBSchema, IDBPDatabase, IDBPTransaction } from 'idb'

type TableRow = string[]

export type StaticTable = {
  kind: 'static'
  columns: TableRow
  rows: TableRow[]
  uuid?: string
  editable?: boolean
}

export type FilterCondition = {
  column: string
  options: string[]
}

export type FilterTable = {
  kind: 'filter'
  parent: string
  conditions: FilterCondition[]
}

export type TableData = StaticTable | FilterTable

export type ResourceMetadata = {
  uuid: string
  kind: 'table' | 'container' | 'page'
  owner: null | string
  title: string
}

export type ResourceTabledata = {
  kind: 'static'
  columns: TableRow
  rows: TableRow[]
}

export type Table = {
  metadata: ResourceMetadata
  data: TableData
  resolved: StaticTable
}

export type ItemList = {
  tables: ResourceMetadata[]
  pages: ResourceMetadata[]
}

interface WorkspaceSchema extends DBSchema {
  resourceList: {
    key: string
    value: ResourceMetadata
    indexes: {
      'by-kind': string
      'by-owner': string
      'by-title': string
    }
  }
  tableData: {
    key: string
    value: TableData
  }
  dependencies: {
    key: string
    value: string[]
  }
  dependents: {
    key: string
    value: string[]
  }
}

class EventListenerManager {
  listeners: Array<() => void> = []

  register(listener: () => void) {
    const index = this.listeners.indexOf(listener)
    if (index !== -1) {
      console.warn('Attempt to add an existent listener.')
      return
    }
    this.listeners.push(listener)
  }

  unregister(listener: () => void) {
    const index = this.listeners.indexOf(listener)
    if (index === -1) {
      console.warn('Attempt to remove a non-existent listener.')
      return
    }

    const first = this.listeners.slice(0, index)
    const second = this.listeners.slice(index + 1)
    this.listeners = first.concat(second)
  }

  notify() {
    for (const listener of this.listeners) {
      listener()
    }
  }
}

export default class AsyncWorkspace {
  private db: Promise<IDBPDatabase<WorkspaceSchema>>

  onResourceListChange = new EventListenerManager()
  private onResourcesChange: { [key: string]: EventListenerManager } = {}

  constructor() {
    this.db = openDB('testdb3', 1, {
      upgrade(db) {
        const store = db.createObjectStore('resourceList', { keyPath: 'uuid' })
        store.createIndex('by-kind', 'kind')
        store.createIndex('by-owner', 'owner')
        store.createIndex('by-title', 'title')

        db.createObjectStore('tableData')
        db.createObjectStore('dependencies')
        db.createObjectStore('dependents')
      }
    })
  }

  private async readDependentGraph() {
    const db = await this.db
    let cursor = await db.transaction('dependents').store.openCursor()
    const graph = {} as { [key: string]: string[] }

    while (cursor) {
      cursor = await cursor.continue()
    }

    return graph
  }

  private async notifyResourceChange(uuid: string) {
    const graph = await this.readDependentGraph()
    let dirtyMap = {} as { [key: string]: boolean }

    let queue: string[] = [uuid]
    while (queue.length > 0) {
      const top = queue[0]
      queue = queue.slice(1)
      if (dirtyMap[top]) {
        continue
      }
      dirtyMap[top] = true
      queue = queue.concat(graph[top])
    }

    for (const dirtyUUID of Object.keys(dirtyMap)) {
      if (this.onResourcesChange[dirtyUUID]) {
        this.onResourcesChange[dirtyUUID].notify()
      }
    }
  }

  observe(uuid: string, listener: () => void) {
    if (!this.onResourcesChange[uuid]) {
      this.onResourcesChange[uuid] = new EventListenerManager()
    }
    this.onResourcesChange[uuid].register(listener)
  }

  unobserve(uuid: string, listener: () => void) {
    if (this.onResourcesChange[uuid]) {
      this.onResourcesChange[uuid].unregister(listener)
    }
  }

  private async readResourceList() {
    const db = await this.db
    return db.getAll('resourceList')
  }

  async readTableList() {
    const list = await this.readResourceList()
    return list.filter(x => x.kind === 'table')
  }

  async readPageList() {
    const list = await this.readResourceList()
    return list.filter(x => x.kind === 'page')
  }

  async readItemList() {
    const list = await this.readResourceList()
    return {
      tables: list.filter(x => x.kind === 'table'),
      pages: list.filter(x => x.kind === 'page')
    }
  }

  async readTableData(uuid: string) {
    const db = await this.db
    const tx = db.transaction(['resourceList', 'tableData'], 'readonly')
    const metadata = await tx.objectStore('resourceList').get(uuid)
    const data = await tx.objectStore('tableData').get(uuid)
    if (metadata === undefined || data === undefined) {
      return undefined
    }

    return { metadata, data }
  }

  private async resolveTable(uuid: string, tx: IDBPTransaction<WorkspaceSchema, ('resourceList' | 'tableData')[]>) {
    const metadata = await tx.objectStore('resourceList').get(uuid)
    const data = await tx.objectStore('tableData').get(uuid)
    if (metadata === undefined || data === undefined) {
      return undefined
    }

    if (data.kind === 'static') {
      return { metadata, data, resolved: data }
    }

    const resolvedParent = await this.resolveTable(data.parent, tx)
    if (!resolvedParent) {
      throw new Error('Invalid database: cannot resolve table!')
    }

    const { columns, rows } = resolvedParent.resolved
    const filtered = rows.filter(row => {
      for (const condition of data.conditions) {
        const columnIndex = columns.indexOf(condition.column)
        if (!condition.options.includes(row[columnIndex])) {
          return false
        }
      }
      return true
    })
    const resolved: StaticTable = { kind: 'static', columns, rows: filtered }

    return { metadata, data, resolved }
  }

  async readTable(uuid: string): Promise<Table | undefined> {
    const db = await this.db
    const tx = db.transaction(['resourceList', 'tableData'], 'readonly')
    return this.resolveTable(uuid, tx)
  }

  async updateTitle(uuid: string, title: string) {
    const db = await this.db

    const tx = db.transaction('resourceList', 'readwrite')
    const store = tx.objectStore('resourceList')
    const metadata = await store.get(uuid)

    if (!metadata) {
      throw new Error('Try to update an non-existent entry.')
    }
    if (metadata.title !== title) {
      metadata.title = title
      store.put(metadata)
    }
    await tx.done
    this.onResourceListChange.notify()
  }

  async updateRow(uuid: string, rowIndex: number, columnName: string, newValue: string) {
    const tableData = await this.readTableData(uuid)
    if (!tableData) {
      throw new Error('Try to update an non-existent entry.')
    }

    if (tableData.data.kind !== 'static') {
      throw new Error('Try to edit a non-static table.')
    }

    const { data } = tableData
    const columnIndex = data.columns.indexOf(columnName)
    data.rows[rowIndex][columnIndex] = newValue
    this.updateTableData(uuid, data)
  }

  async updateTableData(uuid: string, newData: TableData) {
    const db = await this.db
    const tx = db.transaction('tableData', 'readwrite')
    const store = tx.objectStore('tableData')
    const oldData = await store.get(uuid)
    if (!oldData) {
      throw new Error('Try to update an non-existent entry.')
    }

    if (newData.kind !== oldData.kind) {
      throw new Error('Try to change dependencies during table data update.')
    }

    if (newData.kind === 'filter') {
      if (newData.parent !== (oldData as FilterTable).parent) {
        throw new Error('Try to change dependencies during table data update.')
      }
    }
    await store.put(newData, uuid)
    this.notifyResourceChange(uuid)
  }

  async insertTable(uuid: string, title: string, data: TableData) {
    const db = await this.db
    const tx = db.transaction(['resourceList', 'tableData', 'dependencies', 'dependents'], 'readwrite')

    const resourceList = tx.objectStore('resourceList')
    const tableData = tx.objectStore('tableData')
    const dependencies = tx.objectStore('dependencies')
    const dependents = tx.objectStore('dependents')
    const x = await resourceList.get(uuid)
    if (x !== undefined) {
      throw new Error('Try to insert a table with a duplicated UUID.')
    }
    if (data.kind === 'filter') {
      const y = await dependents.get(data.parent)
      if (y === undefined) {
        throw new Error('Try to insert a filter table depending on a non-existent table.')
      }
      dependents.put([...y, uuid], data.parent)
      dependencies.put([data.parent], uuid)
    } else {
      dependencies.put([], uuid)
    }
    resourceList.put({ uuid, kind: 'table', owner: null, title })
    tableData.put(data, uuid)
    dependents.put([uuid], uuid)

    await tx.done
  }

  async insertFilterTable(parent: string) {
    const title = 'Untitled Filter'

    await this.insertTable(UUID(), title, {
      kind: 'filter',
      parent,
      conditions: []
    })

    this.onResourceListChange.notify()
  }

  async insertCSV(csv: string) {
    const title = 'Untitled'

    const data = await new Promise<string[][]>((resolve, reject) => {
      const parser = CSVParse()
      const lines: string[][] = []
      parser.on('readable', () => {
        while (true) {
          const record = parser.read()
          if (!record) {
            return
          }
          lines.push(record)
        }
      })

      parser.on('end', () => resolve(lines))
      parser.write(csv)
      parser.end()
    })

    await this.insertTable(UUID(), title, {
      kind: 'static',
      columns: data[0],
      rows: data.slice(1)
    })
    this.onResourceListChange.notify()
  }
}
