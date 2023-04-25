import React, { useLayoutEffect, useState, useEffect } from 'react'
import rough from 'roughjs/bundled/rough.esm'
import './Build.css'

const generator = rough.generator()
const useHistory = (initialState) => {
  const [index, setIndex] = useState(0)
  const [history, setHistory] = useState([initialState])

  const setState = (action, overwrite = false) => {
    const newState = typeof action === 'function' ? action(history[index]) : action;
    if(overwrite) {
      const historyCopy = [...history]
      historyCopy[index] = newState
      setHistory(historyCopy)
    } else {
      const updatedState = [...history].slice(0, index + 1)
      setHistory([...updatedState, newState])
      setIndex(prevState => prevState + 1)
    }
  }
  const undo = () => index > 0 && setIndex(prevState => prevState - 1)
  const redo = () => index < history.length - 1 && setIndex(prevState => prevState + 1)

  return [history[index], setState, undo, redo]
}

const AddOn = () => {
  const [fill, setFill] = useState('red')
  useEffect(() => {
    const undoRedoFunction = (event) => {
      if((event.metaKey || event.ctrlKey) && event.key === 'z') {
        if(event.shiftKey) {
          redo()
        }
        else {
          undo()
        }
      }
    }
    document.addEventListener('keydown', undoRedoFunction)
    return () => {
      document.removeEventListener('keydown', undoRedoFunction)
    }
})

  const [elements, setElements, undo, redo] = useHistory([])
  const [action, setAction] = useState('none')
  const [elementTool, setElementTool] = useState('selection')
  const [selectedElement, setSelectedElement] = useState(null)
  
  useLayoutEffect(() => {
    const canvas = document.getElementById('canvas')
    const context = canvas.getContext('2d')
    context.clearRect(0, 0, canvas.width, canvas.height)
    const roughCanvas = rough.canvas(canvas)
    elements.forEach(({ roughElement }) => roughCanvas.draw(roughElement))
  }, [elements])

  const createElement = (id, x1, y1, x2, y2, type) => {
    const roughElement = type === 'line' ? generator.line(x1, y1, x2, y2) : generator.rectangle(x1, y1, x2-x1, y2-y1, { fill: fill, hachureAngle: 60, hachureGap: 10 })
    return { id, x1, y1, x2, y2, type, roughElement }
  }

  const nearPoint = (x, y, x1, y1, name) => {
    return Math.abs(x-x1) < 5 && Math.abs(y-y1) < 5 ? name : null
  }

  const positionWithinElement = (x, y, element) => {
    const {type, x1, x2, y1, y2} = element
    if(type === 'rectangle') {
      const topLeft = nearPoint(x, y, x1, y1, 'tl')
      const topRight = nearPoint(x, y, x2, y1, 'tr')
      const bottomLeft = nearPoint(x, y, x1, y2, 'bl')
      const bottomRight = nearPoint(x, y, x2, y2, 'br')
      const inside = x >= x1 && x <= x2 && y >= y1 && y <= y2 ? 'inside' : null
      return topLeft || topRight || bottomLeft || bottomRight || inside
    } else {
      const a = {x: x1, y: y1}
      const b = {x: x2, y: y2}
      const c = {x, y}
      const offset = distance(a, b) - (distance(a, c) + distance(b, c))
      const start = nearPoint(x, y, x1, y1, 'start')
      const end = nearPoint(x, y, x2, y2, 'end')
      const inside = Math.abs(offset) < 1 ? 'inside' : null
      return start || end || inside
    }
  }
  const distance = (a, b) => Math.sqrt(Math.pow(a.x-b.x, 2) + Math.pow(a.y-b.y, 2))

  const getElementAtPosition = (x, y, elements) => {
    return elements.map(element => ({...element, position: positionWithinElement(x, y, element)})).find(element => element.position !== null)
  }

  const updatedElement = (id, x1, y1, x2, y2, type) => {
    const updatedElement = createElement(id, x1, y1, x2, y2, type)
    const elementsCopy = [...elements]
    elementsCopy[id] = updatedElement
    setElements(elementsCopy, true)
  }

  const handleMouseDown = (event) => {
    const {clientX, clientY} = event
    if(elementTool === 'selection') {
      const element = getElementAtPosition(clientX, clientY, elements)
      if(element) {
        const offsetX = clientX - element.x1
        const offsetY = clientY - element.y1
        setSelectedElement({...element, offsetX, offsetY})
        setElements(prevState => prevState)

        if(element.position === 'inside') {
          setAction('moving')
        } else {setAction('resizing')}
      }
    } else {
      const id = elements.length
      const element = createElement(id, clientX, clientY, clientX, clientY, elementTool)
      setElements(prevState => [...prevState, element])
      setSelectedElement(element)
      setAction('drawing')
    }
  }

  const cursorForPosition = (position) => {
    switch(position) {
      case 'tl':
      case 'br':
      case 'start':
      case 'end':
        return 'nwse-resize'
      case 'tr':
      case 'bl':
        return 'nesw-resize'
      default: 
        return 'move'
    }
  }

  const resizedCoordinates = (clientX, clientY, position, coordinates) => {
    const { x1, y1, x2, y2} = coordinates
    switch (position) {
      case 'tl':
      case 'start':
        return {x1: clientX, y1: clientY, x2, y2}
      case 'tr': 
        return {x1, y1: clientY, x2: clientX, y2}
      case 'bl': 
        return {x1: clientX, y1, x2, y2: clientY}
      case 'br': 
      case 'end':
        return {x1, y1, x2: clientX, y2: clientY}
      default:
        return null
    }
  }

  const handleMouseMove = (event) => {
    const {clientX, clientY} = event
    if(elementTool === 'selection') {
      const element = getElementAtPosition(clientX, clientY, elements)
      event.target.style.cursor = element ? cursorForPosition(element.position) : 'default'
    }
    if(action === 'drawing') {
      const index = elements.length - 1
      const { x1, y1 } = elements[index]
      updatedElement(index, x1, y1, clientX, clientY, elementTool)
    } else if (action === 'moving') {
      const { id, x1, y1, x2, y2, type, offsetX, offsetY} = selectedElement
      const width = x2 - x1
      const height = y2 - y1
      const newX1 = clientX - offsetX
      const newY1 = clientY - offsetY
      updatedElement(id, newX1, newY1, newX1 + width, newY1 + height, type)
    } else if (action === 'resizing') {
      const { id, type, position, ...coordinates} = selectedElement
      const { x1, y1, x2, y2 } = resizedCoordinates(clientX, clientY, position, coordinates)
      updatedElement(id, x1, y1, x2, y2, type)
    }
  }

  const adjustElementCoordinates = (element) => {
    const { type, x1, y1, x2, y2 } = element
    if(type === 'rectangle') {
      const minX = Math.min(x1, x2)
      const maxX = Math.max(x1, x2)
      const minY = Math.min(y1, y2)
      const maxY = Math.max(y1, y2)
      return {x1: minX, y1: minY, x2: maxX, y2: maxY}
    }
    else {
      if(x1 < x2 || (x1 === x2 && y1 < y2)) {
        return {x1, y1, x2, y2}
      } else {
        return {x1: x2, y1: y2, x2: x1, y2: y1}}
    }
  }

  const handleMouseUp = () => {
    if(selectedElement) {
      const index = selectedElement.id
      const { id, type } = elements[index]
      if(action === 'drawing' || action === 'resizing') {
        const {x1, y1, x2, y2} = adjustElementCoordinates(elements[index])
        updatedElement(id, x1, y1, x2, y2, type)
      }
    }
      setAction('none')
      setSelectedElement(null)
  }

  return(
    <div>
      <div style={{position: 'fixed', borderRight: '2px solid black', height: '100%', width: '15%', display: 'flex', flexDirection: 'column', padding: '30px 0 0 25px', alignItems: 'flex-start'}}>
      Drawing Tools:
      <div style={{paddingTop: '5px'}}>
        <input 
          type='radio'
          id='selection'
          checked={elementTool === 'selection'}
          onChange={() => setElementTool('selection')}
          />
        <label htmlFor='line'>Selection</label>
      </div>
      <div>
        <input 
          type='radio'
          id='line'
          checked={elementTool === 'line'}
          onChange={() => setElementTool('line')}
        />
        <label htmlFor='line'>Line</label>
        </div>
        <div>
        <input 
          type='radio'
          id='rectangle'
          checked={elementTool === 'rectangle'}
          onChange={() => setElementTool('rectangle')}
        />
        <label htmlFor='rectangle'>Rectangle</label>
      </div>
      <label>Choose a color: </label>
      <select value={fill} onChange={e => setFill(e.target.value)}>
        <option value='red'>Red</option>
        <option value='blue'>Blue</option>
        <option value='green'>Green</option>
      </select>
      {/* <div>
        <input 
          type='radio'
          id='text'
          checked={elementTool === 'text'}
          onChange={() => setElementTool('text')}
        />
        <label htmlFor='text'>Text</label>
      </div> */}
      </div>
      <div style={{position: 'fixed', bottom: 0, padding: 10}}>
        <button onClick={undo}>Undo</button>
        <button onClick={redo}>Redo</button>
      </div>
      <canvas 
        id='canvas' 
        width={window.innerWidth} 
        height={window.innerHeight}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        >Canvas
      </canvas>
    </div>
  )
}

export default AddOn