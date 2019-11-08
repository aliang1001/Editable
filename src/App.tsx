import React from 'react'
import { DndProvider } from 'react-dnd'
import HTML5Backend from 'react-dnd-html5-backend'
import { BrowserRouter as Router, Route } from 'react-router-dom'

import './App.css'

import Context from './Context'
import * as Types from './Model/Workspace'
import Workspace from './Model/Workspace'
import Views from './Views'

function Index() {
  return <h2>Home</h2>
}

function App() {
  const workspace = React.useMemo(() => new Workspace(), [])
  const [itemList, setItemList] = React.useState<Types.ItemList>({ tables: [], pages: [] })

  React.useEffect(() => {
    const callback = () => {
      workspace.readItemList().then(setItemList)
    }
    callback()
    workspace.onResourceListChange.register(callback)

    return () => {
      workspace.onResourceListChange.unregister(callback)
    }
  }, [workspace])

  return (
    <Router>
      <Context.workspace.Provider value={workspace}>
        <div id='app'>
          <Views.SideNav tables={itemList.tables} pages={itemList.pages} />
          <main>
            <DndProvider backend={HTML5Backend}>
              <Route path='/' exact component={Index} />
              <Route path='/tables/' exact component={Views.Database} />
              <Route path='/table/:id' component={Views.TablePage} />
            </DndProvider>
          </main>
        </div>
      </Context.workspace.Provider>
    </Router>
  )
}

export default App
