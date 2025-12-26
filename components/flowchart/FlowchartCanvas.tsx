import React, { useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const GRID_SIZE = 20;
const CANVAS_SIZE = 3000; // Large canvas for panning
const MIN_SCALE = 0.3;
const MAX_SCALE = 3;
const NODE_WIDTH = 150;
const NODE_HEIGHT = 50;

interface Node {
  id: string;
  x: number;
  y: number;
  label: string;
}

interface Edge {
  id: string;
  sourceId: string;
  targetId: string;
  sourcePosition: 'top' | 'bottom' | 'left' | 'right';
  targetPosition: 'top' | 'bottom' | 'left' | 'right';
}

interface DraggableNodeProps {
  node: Node;
  onMove: (id: string, x: number, y: number) => void;
  onDragging: (id: string, x: number, y: number) => void;
  onDragEnd: (id: string) => void;
  onConnectionPointTap: (nodeId: string, position: 'top' | 'bottom' | 'left' | 'right') => void;
  onConnectionDragStart: (nodeId: string, position: 'top' | 'bottom' | 'left' | 'right') => void;
  onConnectionDragMove: (dx: number, dy: number) => void;
  onConnectionDragEnd: (nodeId: string, position: 'top' | 'bottom' | 'left' | 'right') => void;
  onConnectionDragCancel: () => void;
  isConnecting: boolean;
  connectingNodeId: string | null;
  allNodes: Node[];
  canvasScale: number;
}

function DraggableNode({ 
  node, 
  onMove, 
  onDragging,
  onDragEnd,
  onConnectionPointTap, 
  onConnectionDragStart,
  onConnectionDragMove,
  onConnectionDragEnd,
  onConnectionDragCancel,
  isConnecting, 
  connectingNodeId,
  allNodes,
  canvasScale
}: DraggableNodeProps) {
  const translateX = useSharedValue(node.x);
  const translateY = useSharedValue(node.y);
  const scale = useSharedValue(1);
  
  // Use refs to store latest values without causing re-renders
  const isDraggingConnectionRef = useRef(false);
  const allNodesRef = useRef(allNodes);
  allNodesRef.current = allNodes;
  
  // Store node position in ref to access latest value in callbacks
  const nodeRef = useRef(node);
  nodeRef.current = node;
  
  // Store canvasScale in ref
  const canvasScaleRef = useRef(canvasScale);
  canvasScaleRef.current = canvasScale;
  
  // Store callbacks in refs to access latest versions
  const callbacksRef = useRef({
    onMove,
    onDragging,
    onDragEnd,
    onConnectionDragStart,
    onConnectionDragMove,
    onConnectionDragEnd,
    onConnectionDragCancel,
  });
  callbacksRef.current = {
    onMove,
    onDragging,
    onDragEnd,
    onConnectionDragStart,
    onConnectionDragMove,
    onConnectionDragEnd,
    onConnectionDragCancel,
  };

  // Memoize node drag PanResponder
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !isDraggingConnectionRef.current,
    onMoveShouldSetPanResponder: () => !isDraggingConnectionRef.current,
    onStartShouldSetPanResponderCapture: () => false,
    onMoveShouldSetPanResponderCapture: () => false,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      scale.value = withSpring(1.05);
    },
    onPanResponderMove: (_, gestureState) => {
      // Divide by scale to get correct canvas coordinates
      const scaledDx = gestureState.dx / canvasScaleRef.current;
      const scaledDy = gestureState.dy / canvasScaleRef.current;
      const newX = nodeRef.current.x + scaledDx;
      const newY = nodeRef.current.y + scaledDy;
      translateX.value = newX;
      translateY.value = newY;
      // Update edge positions in real-time
      callbacksRef.current.onDragging(nodeRef.current.id, newX, newY);
    },
    onPanResponderRelease: (_, gestureState) => {
      scale.value = withSpring(1);
      const scaledDx = gestureState.dx / canvasScaleRef.current;
      const scaledDy = gestureState.dy / canvasScaleRef.current;
      const newX = nodeRef.current.x + scaledDx;
      const newY = nodeRef.current.y + scaledDy;
      callbacksRef.current.onMove(nodeRef.current.id, newX, newY);
      callbacksRef.current.onDragEnd(nodeRef.current.id);
    },
  }), []);

  // Create memoized pan responder for connection point drag
  const createConnectionPanResponder = (position: 'top' | 'bottom' | 'left' | 'right') => {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        isDraggingConnectionRef.current = true;
        callbacksRef.current.onConnectionDragStart(nodeRef.current.id, position);
      },
      onPanResponderMove: (_, gestureState) => {
        // Divide by scale to get correct canvas coordinates
        const scaledDx = gestureState.dx / canvasScaleRef.current;
        const scaledDy = gestureState.dy / canvasScaleRef.current;
        callbacksRef.current.onConnectionDragMove(scaledDx, scaledDy);
      },
      onPanResponderRelease: (_, gestureState) => {
        isDraggingConnectionRef.current = false;
        
        const currentNode = nodeRef.current;
        const currentScale = canvasScaleRef.current;
        // Calculate drop position with scale compensation
        const scaledDx = gestureState.dx / currentScale;
        const scaledDy = gestureState.dy / currentScale;
        const startX = currentNode.x + (position === 'left' ? 0 : position === 'right' ? NODE_WIDTH : NODE_WIDTH / 2);
        const startY = currentNode.y + (position === 'top' ? 0 : position === 'bottom' ? NODE_HEIGHT : NODE_HEIGHT / 2);
        const dropX = startX + scaledDx;
        const dropY = startY + scaledDy;
        
        const currentNodes = allNodesRef.current;
        console.log('Drop at:', dropX, dropY, 'from node:', currentNode.id, 'available nodes:', currentNodes.map(n => ({ id: n.id, x: n.x, y: n.y })));
        
        // Find if we're over any other node
        let foundTarget = false;
        for (const otherNode of currentNodes) {
          if (otherNode.id === currentNode.id) continue;
          
          // Check if dropped within the other node's bounds (more generous)
          const nodeLeft = otherNode.x - 20;
          const nodeRight = otherNode.x + NODE_WIDTH + 20;
          const nodeTop = otherNode.y - 20;
          const nodeBottom = otherNode.y + NODE_HEIGHT + 20;
          
          if (dropX >= nodeLeft && dropX <= nodeRight && dropY >= nodeTop && dropY <= nodeBottom) {
            // Determine which connection point is closest
            const positions: ('top' | 'bottom' | 'left' | 'right')[] = ['top', 'bottom', 'left', 'right'];
            let closestPos: 'top' | 'bottom' | 'left' | 'right' = 'top';
            let minDistance = Infinity;
            
            for (const pos of positions) {
              const point = {
                x: otherNode.x + (pos === 'left' ? 0 : pos === 'right' ? NODE_WIDTH : NODE_WIDTH / 2),
                y: otherNode.y + (pos === 'top' ? 0 : pos === 'bottom' ? NODE_HEIGHT : NODE_HEIGHT / 2),
              };
              const distance = Math.sqrt(Math.pow(dropX - point.x, 2) + Math.pow(dropY - point.y, 2));
              if (distance < minDistance) {
                minDistance = distance;
                closestPos = pos;
              }
            }
            
            console.log('Found target node:', otherNode.id, 'position:', closestPos);
            callbacksRef.current.onConnectionDragEnd(otherNode.id, closestPos);
            foundTarget = true;
            break;
          }
        }
        
        if (!foundTarget) {
          console.log('No target found');
          callbacksRef.current.onConnectionDragCancel();
        }
      },
    });
  };

  // Memoize connection point PanResponders to prevent recreation
  const topPanResponder = useMemo(() => createConnectionPanResponder('top'), []);
  const bottomPanResponder = useMemo(() => createConnectionPanResponder('bottom'), []);
  const leftPanResponder = useMemo(() => createConnectionPanResponder('left'), []);
  const rightPanResponder = useMemo(() => createConnectionPanResponder('right'), []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const isSourceNode = connectingNodeId === node.id;

  return (
    <Animated.View
      style={[styles.node, animatedStyle]}
    >
      {/* Node drag area - center of node */}
      <View 
        style={styles.nodeDragArea}
        {...panResponder.panHandlers}
      >
        <Text style={styles.nodeText}>{node.label}</Text>
      </View>
      
      {/* Connection points - now draggable, positioned outside */}
      <View 
        style={[styles.connectionPoint, styles.connectionTop, isConnecting && !isSourceNode && styles.connectionPointActive]}
        {...topPanResponder.panHandlers}
      />
      <View 
        style={[styles.connectionPoint, styles.connectionBottom, isConnecting && !isSourceNode && styles.connectionPointActive]}
        {...bottomPanResponder.panHandlers}
      />
      <View 
        style={[styles.connectionPoint, styles.connectionLeft, isConnecting && !isSourceNode && styles.connectionPointActive]}
        {...leftPanResponder.panHandlers}
      />
      <View 
        style={[styles.connectionPoint, styles.connectionRight, isConnecting && !isSourceNode && styles.connectionPointActive]}
        {...rightPanResponder.panHandlers}
      />
    </Animated.View>
  );
}

export default function FlowchartCanvas() {
  const insets = useSafeAreaInsets();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [nodeCounter, setNodeCounter] = useState(1);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [connectingFrom, setConnectingFrom] = useState<{nodeId: string, position: 'top' | 'bottom' | 'left' | 'right'} | null>(null);
  const [dragLine, setDragLine] = useState<{startX: number, startY: number, endX: number, endY: number} | null>(null);
  // Track node position during drag for real-time edge updates
  const [draggingNode, setDraggingNode] = useState<{id: string, x: number, y: number} | null>(null);
  // Track current scale for gesture compensation
  const [currentScale, setCurrentScale] = useState(1);

  // Canvas transform values - start centered
  const initialX = -(CANVAS_SIZE / 2 - SCREEN_WIDTH / 2);
  const initialY = -(CANVAS_SIZE / 2 - SCREEN_HEIGHT / 2);
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(initialX);
  const translateY = useSharedValue(initialY);
  const savedTranslateX = useSharedValue(initialX);
  const savedTranslateY = useSharedValue(initialY);

  // Get connection point coordinates for a node, with optional override for dragging position
  const getConnectionPoint = (node: Node, position: 'top' | 'bottom' | 'left' | 'right', overridePos?: {x: number, y: number}) => {
    const nodeX = overridePos?.x ?? node.x;
    const nodeY = overridePos?.y ?? node.y;
    const centerX = nodeX + NODE_WIDTH / 2;
    const centerY = nodeY + NODE_HEIGHT / 2;
    
    switch (position) {
      case 'top':
        return { x: centerX, y: nodeY };
      case 'bottom':
        return { x: centerX, y: nodeY + NODE_HEIGHT };
      case 'left':
        return { x: nodeX, y: centerY };
      case 'right':
        return { x: nodeX + NODE_WIDTH, y: centerY };
    }
  };

  // Start connection drag from a connection point
  const handleConnectionDragStart = (nodeId: string, position: 'top' | 'bottom' | 'left' | 'right') => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    const point = getConnectionPoint(node, position);
    setConnectingFrom({ nodeId, position });
    setDragLine({ startX: point.x, startY: point.y, endX: point.x, endY: point.y });
  };

  // Update drag line position
  const handleConnectionDragMove = (dx: number, dy: number) => {
    if (dragLine) {
      setDragLine({
        ...dragLine,
        endX: dragLine.startX + dx,
        endY: dragLine.startY + dy,
      });
    }
  };

  // End connection drag - check if dropped on a connection point
  const handleConnectionDragEnd = (nodeId: string, position: 'top' | 'bottom' | 'left' | 'right') => {
    if (connectingFrom && connectingFrom.nodeId !== nodeId) {
      const newEdge: Edge = {
        id: `edge-${Date.now()}`,
        sourceId: connectingFrom.nodeId,
        targetId: nodeId,
        sourcePosition: connectingFrom.position,
        targetPosition: position,
      };
      setEdges([...edges, newEdge]);
    }
    setConnectingFrom(null);
    setDragLine(null);
  };

  // Cancel connection drag
  const cancelConnectionDrag = () => {
    setConnectingFrom(null);
    setDragLine(null);
  };

  // Handle connection point tap (for tap-to-connect mode)
  const handleConnectionPointTap = (nodeId: string, position: 'top' | 'bottom' | 'left' | 'right') => {
    if (connectingFrom === null) {
      // Start connection
      setConnectingFrom({ nodeId, position });
    } else {
      // Complete connection
      if (connectingFrom.nodeId !== nodeId) {
        const newEdge: Edge = {
          id: `edge-${Date.now()}`,
          sourceId: connectingFrom.nodeId,
          targetId: nodeId,
          sourcePosition: connectingFrom.position,
          targetPosition: position,
        };
        setEdges([...edges, newEdge]);
      }
      setConnectingFrom(null);
    }
  };

  const addNode = () => {
    const newNode: Node = {
      id: `node-${Date.now()}`,
      x: CANVAS_SIZE / 2 - 75,
      y: CANVAS_SIZE / 2 - 25,
      label: `Node ${nodeCounter}`,
    };
    setNodes([...nodes, newNode]);
    setNodeCounter(nodeCounter + 1);
  };

  const moveNode = (id: string, x: number, y: number) => {
    setNodes(
      nodes.map((node) => (node.id === id ? { ...node, x, y } : node))
    );
  };

  // Handle node dragging for real-time edge updates
  const handleNodeDragging = (id: string, x: number, y: number) => {
    setDraggingNode({ id, x, y });
  };

  // Handle node drag end - clear dragging state
  const handleNodeDragEnd = (id: string) => {
    setDraggingNode(null);
  };

  // Canvas pan responder
  const canvasPanResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: (_, gestureState) => {
      translateX.value = savedTranslateX.value + gestureState.dx;
      translateY.value = savedTranslateY.value + gestureState.dy;
    },
    onPanResponderRelease: () => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    },
  });

  // Animated style for canvas transform
  const canvasAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  // Generate grid lines for large canvas
  const renderGrid = () => {
    const horizontalLines = [];
    const verticalLines = [];

    for (let i = 0; i < CANVAS_SIZE / GRID_SIZE; i++) {
      horizontalLines.push(
        <View
          key={`h-${i}`}
          style={[
            styles.gridLine,
            styles.horizontalLine,
            { top: i * GRID_SIZE },
          ]}
        />
      );
    }

    for (let i = 0; i < CANVAS_SIZE / GRID_SIZE; i++) {
      verticalLines.push(
        <View
          key={`v-${i}`}
          style={[
            styles.gridLine,
            styles.verticalLine,
            { left: i * GRID_SIZE },
          ]}
        />
      );
    }

    return [...horizontalLines, ...verticalLines];
  };

  // Zoom controls
  const zoomIn = () => {
    const newScale = Math.min(scale.value * 1.2, MAX_SCALE);
    scale.value = withSpring(newScale);
    savedScale.value = newScale;
    setCurrentScale(newScale);
  };

  const zoomOut = () => {
    const newScale = Math.max(scale.value / 1.2, MIN_SCALE);
    scale.value = withSpring(newScale);
    savedScale.value = newScale;
    setCurrentScale(newScale);
  };

  const resetView = () => {
    scale.value = withSpring(1);
    savedScale.value = 1;
    setCurrentScale(1);
    translateX.value = withSpring(initialX);
    translateY.value = withSpring(initialY);
    savedTranslateX.value = initialX;
    savedTranslateY.value = initialY;
  };

  return (
    <GestureHandlerRootView style={styles.container}>
      {/* Header with Safe Area */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Text style={styles.headerTitle}>Flowchart Creator</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity style={styles.headerButton} onPress={zoomIn}>
            <Text style={styles.headerButtonText}>🔍+</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton} onPress={zoomOut}>
            <Text style={styles.headerButtonText}>🔍-</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton} onPress={resetView}>
            <Text style={styles.headerButtonText}>⟳</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Zoomable/Pannable Canvas */}
      <View style={styles.canvasContainer}>
        <Animated.View 
          style={[styles.canvas, canvasAnimatedStyle]}
          {...canvasPanResponder.panHandlers}
        >
          {/* Bezier curve edges */}
          {edges.map((edge) => {
            const sourceNode = nodes.find(n => n.id === edge.sourceId);
            const targetNode = nodes.find(n => n.id === edge.targetId);
            if (!sourceNode || !targetNode) return null;
            
            // Use dragging position if this node is being dragged
            const sourceOverride = draggingNode?.id === sourceNode.id ? { x: draggingNode.x, y: draggingNode.y } : undefined;
            const targetOverride = draggingNode?.id === targetNode.id ? { x: draggingNode.x, y: draggingNode.y } : undefined;
            
            const start = getConnectionPoint(sourceNode, edge.sourcePosition, sourceOverride);
            const end = getConnectionPoint(targetNode, edge.targetPosition, targetOverride);
            
            // Calculate control points for smooth bezier curve
            const distance = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
            const curveOffset = Math.min(distance * 0.5, 80); // Curve intensity
            
            // Control points based on connection positions
            let cp1 = { x: start.x, y: start.y };
            let cp2 = { x: end.x, y: end.y };
            
            // Adjust control points based on source position
            switch (edge.sourcePosition) {
              case 'top':
                cp1 = { x: start.x, y: start.y - curveOffset };
                break;
              case 'bottom':
                cp1 = { x: start.x, y: start.y + curveOffset };
                break;
              case 'left':
                cp1 = { x: start.x - curveOffset, y: start.y };
                break;
              case 'right':
                cp1 = { x: start.x + curveOffset, y: start.y };
                break;
            }
            
            // Adjust control points based on target position
            switch (edge.targetPosition) {
              case 'top':
                cp2 = { x: end.x, y: end.y - curveOffset };
                break;
              case 'bottom':
                cp2 = { x: end.x, y: end.y + curveOffset };
                break;
              case 'left':
                cp2 = { x: end.x - curveOffset, y: end.y };
                break;
              case 'right':
                cp2 = { x: end.x + curveOffset, y: end.y };
                break;
            }
            
            // Generate bezier curve points
            const segments = 20;
            const curveSegments = [];
            
            for (let i = 0; i < segments; i++) {
              const t1 = i / segments;
              const t2 = (i + 1) / segments;
              
              // Cubic bezier formula
              const getPoint = (t: number) => {
                const mt = 1 - t;
                return {
                  x: mt * mt * mt * start.x + 3 * mt * mt * t * cp1.x + 3 * mt * t * t * cp2.x + t * t * t * end.x,
                  y: mt * mt * mt * start.y + 3 * mt * mt * t * cp1.y + 3 * mt * t * t * cp2.y + t * t * t * end.y,
                };
              };
              
              const p1 = getPoint(t1);
              const p2 = getPoint(t2);
              
              const segDx = p2.x - p1.x;
              const segDy = p2.y - p1.y;
              const segLength = Math.sqrt(segDx * segDx + segDy * segDy);
              const segAngle = Math.atan2(segDy, segDx) * (180 / Math.PI);
              
              curveSegments.push(
                <View
                  key={`${edge.id}-seg-${i}`}
                  style={{
                    position: 'absolute',
                    left: p1.x,
                    top: p1.y - 1,
                    width: segLength + 1, // +1 to prevent gaps
                    height: 2,
                    backgroundColor: '#4A9EE0',
                    transformOrigin: 'left center',
                    transform: [{ rotate: `${segAngle}deg` }],
                  }}
                />
              );
            }
            
            return <React.Fragment key={edge.id}>{curveSegments}</React.Fragment>;
          })}
          
          {/* Drag line - shows while dragging from connection point */}
          {dragLine && (
            <View
              style={{
                position: 'absolute',
                left: dragLine.startX,
                top: dragLine.startY - 1,
                width: Math.sqrt(Math.pow(dragLine.endX - dragLine.startX, 2) + Math.pow(dragLine.endY - dragLine.startY, 2)),
                height: 2,
                backgroundColor: '#FF6B6B',
                transformOrigin: 'left center',
                transform: [{ rotate: `${Math.atan2(dragLine.endY - dragLine.startY, dragLine.endX - dragLine.startX) * (180 / Math.PI)}deg` }],
              }}
            />
          )}
          
          {renderGrid()}
          
          {/* Nodes */}
          {nodes.map((node) => (
            <DraggableNode 
              key={node.id} 
              node={node} 
              onMove={moveNode}
              onDragging={handleNodeDragging}
              onDragEnd={handleNodeDragEnd}
              onConnectionPointTap={handleConnectionPointTap}
              onConnectionDragStart={handleConnectionDragStart}
              onConnectionDragMove={handleConnectionDragMove}
              onConnectionDragEnd={handleConnectionDragEnd}
              onConnectionDragCancel={cancelConnectionDrag}
              isConnecting={connectingFrom !== null}
              connectingNodeId={connectingFrom?.nodeId || null}
              allNodes={nodes}
              canvasScale={currentScale}
            />
          ))}
        </Animated.View>
      </View>

      {/* Right Side Panel - 4 Buttons */}
      <View style={styles.rightPanel}>
        <TouchableOpacity style={styles.panelButton} onPress={addNode}>
          <View style={styles.rectangleIcon} />
          <Text style={styles.panelButtonText}>Dikdörtgen</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.panelButton} onPress={addNode}>
          <View style={styles.rectangleIcon} />
          <Text style={styles.panelButtonText}>Karar</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.panelButton} onPress={addNode}>
          <View style={styles.rectangleIcon} />
          <Text style={styles.panelButtonText}>Başla</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.panelButton} onPress={addNode}>
          <View style={styles.rectangleIcon} />
          <Text style={styles.panelButtonText}>Bitir</Text>
        </TouchableOpacity>
      </View>

      {/* Add Button (FAB) */}
      <TouchableOpacity style={styles.fab} onPress={addNode}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    minHeight: 56,
    paddingBottom: 12,
    backgroundColor: '#4A9EE0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    padding: 8,
  },
  headerButtonText: {
    color: '#FFFFFF',
    fontSize: 20,
  },
  canvas: {
    width: CANVAS_SIZE,
    height: CANVAS_SIZE,
    backgroundColor: '#FAFAFA',
    position: 'relative',
  },
  canvasContainer: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#FAFAFA',
  },
  gridLine: {
    position: 'absolute',
    backgroundColor: '#E0E0E0',
  },
  horizontalLine: {
    left: 0,
    right: 0,
    height: 1,
  },
  verticalLine: {
    top: 0,
    bottom: 0,
    width: 1,
  },
  node: {
    position: 'absolute',
    width: 150,
    height: 50,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#4A9EE0',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  nodeText: {
    color: '#333333',
    fontSize: 14,
    fontWeight: '500',
  },
  nodeDragArea: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  connectionPoint: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#4A9EE0',
  },
  connectionPointActive: {
    backgroundColor: '#4A9EE0',
    borderColor: '#2E7BB8',
    transform: [{ scale: 1.2 }],
  },
  connectionTop: {
    top: -10,
    left: '50%',
    marginLeft: -10,
  },
  connectionBottom: {
    bottom: -10,
    left: '50%',
    marginLeft: -10,
  },
  connectionLeft: {
    left: -10,
    top: '50%',
    marginTop: -10,
  },
  connectionRight: {
    right: -10,
    top: '50%',
    marginTop: -10,
  },
  rightPanel: {
    position: 'absolute',
    right: 16,
    top: 120,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 8,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    gap: 8,
  },
  panelButton: {
    width: 80,
    height: 60,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  rectangleIcon: {
    width: 40,
    height: 24,
    borderWidth: 2,
    borderColor: '#4A9EE0',
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
  panelButtonText: {
    fontSize: 10,
    color: '#666666',
    marginTop: 4,
  },
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: '#4A9EE0',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  fabText: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '300',
    lineHeight: 36,
  },
});
