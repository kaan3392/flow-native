# Basic Flowchart

**Basic Flowchart** is a mobile-first flowchart creation tool built with React Native and Expo. It allows users to easily create, customize, and manage flowcharts with a touch-optimized interface. The app supports bilingual interfaces (English/Turkish) and persists user data and preferences automatically.

## Key Features

### 1. **Node Management**

- **Add Nodes**: Drag and drop nodes from the sidebar onto the canvas.
- **Node Types**:
  - **Rectangle**: Standard process step.
  - **Diamond**: Decision point.
  - **Ellipse**: Start/End terminator.
  - **Parallelogram**: Input/Output.
  - **Hexagon**: Preparation/Initialization.
  - **Storage**: Data storage/Database.
- **Drag & Drop**: smooth dragging mechanics with `PanResponder`.
- **Snap to Grid**: Optional grid snapping (configurable) for alignment.

### 2. **Connections (Edges)**

- **Create Connections**: Drag from any connection point (top, bottom, left, right) of a node to another node's connection point.
- **Visual Feedback**: Active connection points light up when dragging starts. Use of dynamic hit-testing ensures accurate connections even for complex shapes like Diamonds.
- **Automatic Routing**: Edges are drawn as straight lines utilizing SVG.

### 3. **Customization**

- **Edit Text**: Double-tap a node to edit its label. Support for bold text, font size, and text color.
- **Edit Element**: Customize individual node properties:
  - Background Color
  - Border Color & Width
  - Elevation (Shadow depth)
- **Global Defaults**: Set default styles for all new nodes via "Change Defaults" in the menu.

### 4. **Canvas Tools**

- **Zoom & Pan**: Pinch to zoom and drag to pan around an infinite canvas.
- **Grid**: Toggleable background grid with customizable size and color.
- **Reset View**: Quickly return to the default zoom and center position.

### 5. **Multi-Language Support**

- **Bilingual**: Full support for **English** and **Turkish**.
- **Dynamic Switching**: Change languages instantly from the "Options" -> "Languages" menu.
- **Persistence**: Language preference is saved and reloads on app launch.

### 6. **Data Persistence**

- **Auto-Save**: The chart layout (nodes and connections) and user preferences (language, defaults) are automatically saved to local storage (`AsyncStorage`).

## Installation & Running

1.  **Install Dependencies**:

    ```bash
    npm install
    ```

2.  **Start the App**:
    ```bash
    npx expo start
    ```
    - Press `a` for Android Emulator
    - Press `i` for iOS Simulator

## User Guide

### Getting Started

1.  **Adding a Node**: Open the sidebar (if closed), press and hold a shape, and drag it into the workspace.
2.  **Connecting Nodes**: Tap and drag from a blue dot (connection point) on one node to a dot on another node.
3.  **Editing**:
    - **Text**: Tap a node, then tap "Edit Text" (or double-tap).
    - **Style**: Tap a node -> "Edit Element" to change colors and borders.
4.  **Deleting**: Tap a node -> "Delete". Or clear the entire chart from Options -> "Clear Chart".

### Changing Language

1.  Tap the **Options** menu icon (top right).
2.  Select **Languages** (or **Diller**).
3.  Choose **English** or **Türkçe**.
4.  Tap **Close**.

## Technical Stack

- **Framework**: React Native (Expo SDK)
- **Language**: TypeScript
- **Graphics**: `react-native-svg` for shapes and lines.
- **Animations**: `react-native-reanimated` for UI transitions.
- **Icons**: `react-native-vector-icons` (MaterialCommunityIcons).
- **Storage**: `@react-native-async-storage/async-storage` for local data persistence.

## Architecture Highlights

- **Single Canvas Component**: Core logic resides in `FlowchartCanvas.tsx`.
- **Coordinate System**: A unified coordinate system handles pan/zoom offsets to map screen touches to canvas coordinates.
- **Localization**: A lightweight Translation Manager (`translations.ts`) handles internationalization without heavy external libraries.
