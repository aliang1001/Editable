import React from 'react'
import { NavLink } from 'react-router-dom'

import './SideNav.scss'

import { ItemList } from '../Model/Workspace'

const SideNav: React.FC<ItemList> = ({ tables, pages }) => {
  const tableLinks = tables.map(({ uuid, title }) => {
    return (
      <li key={uuid}>
        <NavLink exact to={`/table/${uuid}`}>
          {title}
        </NavLink>
      </li>
    )
  })

  const pageLinks = pages.map(({ uuid, title }) => {
    return (
      <li key={uuid}>
        <NavLink exact to={`/document/${uuid}`}>
          {title}
        </NavLink>
      </li>
    )
  })

  return (
    <nav className='sidenav'>
      <h1>
        <NavLink exact to='/'>
          Home
        </NavLink>
      </h1>
      <h1>
        <NavLink exact to='/tables/'>
          Tables
        </NavLink>
      </h1>
      <ul>{tableLinks}</ul>
      <h1>
        <NavLink exact to='/documents/'>
          Documents
        </NavLink>
      </h1>
      <ul>{pageLinks}</ul>
    </nav>
  )
}

export default SideNav
