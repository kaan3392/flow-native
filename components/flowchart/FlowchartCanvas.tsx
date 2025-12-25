import { useState } from 'react';
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
  onConnectionPointTap: (nodeId: string, position: 'top' | 'bottom' | 'left' | 'right') => void;
  isConnecting: boolean;
  connectingNodeId: string | null;
}

function DraggableNode({ node, onMove, onConnectionPointTap, isConnecting, connectingNodeId }: DraggableNodeProps) {
  const translateX = useSharedValue(node.x);
  const translateY = useSharedValue(node.y);
  const scale = useSharedValue(1);

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => !isConnecting,
    onMoveShouldSetPanResponder: () => !isConnecting,
    onStartShouldSetPanResponderCapture: () => !isConnecting,
    onMoveShouldSetPanResponderCapture: () => !isConnecting,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      scale.value = withSpring(1.05);
    },
    onPanResponderMove: (_, gestureState) => {
      translateX.value = node.x + gestureState.dx;
      translateY.value = node.y + gestureState.dy;
    },
    onPanResponderRelease: (_, gestureState) => {
      scale.value = withSpring(1);
      const newX = node.x + gestureState.dx;
      const newY = node.y + gestureState.dy;
      onMove(node.id, newX, newY);
    },
  });

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
      {...panResponder.panHandlers}
    >
      {/* Connection points */}
      <TouchableOpacity 
        style={[styles.connectionPoint, styles.connectionTop, isConnecting && !isSourceNode && styles.connectionPointActive]}
        onPress={() => onConnectionPointTap(node.id, 'top')}
      />
      <TouchableOpacity 
        style={[styles.connectionPoint, styles.connectionBottom, isConnecting && !isSourceNode && styles.connectionPointActive]}
        onPress={() => onConnectionPointTap(node.id, 'bottom')}
      />
      <TouchableOpacity 
        style={[styles.connectionPoint, styles.connectionLeft, isConnecting && !isSourceNode && styles.connectionPointActive]}
        onPress={() => onConnectionPointTap(node.id, 'left')}
      />
      <TouchableOpacity 
        style={[styles.connectionPoint, styles.connectionRight, isConnecting && !isSourceNode && styles.connectionPointActive]}
        onPress={() => onConnectionPointTap(node.id, 'right')}
      />
      
      <Text style={styles.nodeText}>{node.label}</Text>
    </Animated.View>
  );
}

export default function FlowchartCanvas() {
  const insets = useSafeAreaInsets();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [nodeCounter, setNodeCounter] = useState(1);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [connectingFrom, setConnectingFrom] = useState<{nodeId: string, position: 'top' | 'bottom' | 'left' | 'right'} | null>(null);

  // Canvas transform values - start centered
  const initialX = -(CANVAS_SIZE / 2 - SCREEN_WIDTH / 2);
  const initialY = -(CANVAS_SIZE / 2 - SCREEN_HEIGHT / 2);
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(initialX);
  const translateY = useSharedValue(initialY);
  const savedTranslateX = useSharedValue(initialX);
  const savedTranslateY = useSharedValue(initialY);

  // Get connection point coordinates for a node
  const getConnectionPoint = (node: Node, position: 'top' | 'bottom' | 'left' | 'right') => {
    const centerX = node.x + NODE_WIDTH / 2;
    const centerY = node.y + NODE_HEIGHT / 2;
    
    switch (position) {
      case 'top':
        return { x: centerX, y: node.y };
      case 'bottom':
        return { x: centerX, y: node.y + NODE_HEIGHT };
      case 'left':
        return { x: node.x, y: centerY };
      case 'right':
        return { x: node.x + NODE_WIDTH, y: centerY };
    }
  };

  // Handle connection point tap
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
  };

  const zoomOut = () => {
    const newScale = Math.max(scale.value / 1.2, MIN_SCALE);
    scale.value = withSpring(newScale);
    savedScale.value = newScale;
  };

  const resetView = () => {
    scale.value = withSpring(1);
    savedScale.value = 1;
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
          {/* View-based edges (since react-native-svg has issues with Expo Go) */}
          {edges.map((edge) => {
            const sourceNode = nodes.find(n => n.id === edge.sourceId);
            const targetNode = nodes.find(n => n.id === edge.targetId);
            if (!sourceNode || !targetNode) return null;
            
            const start = getConnectionPoint(sourceNode, edge.sourcePosition);
            const end = getConnectionPoint(targetNode, edge.targetPosition);
            
            // Calculate line properties
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);
            
            return (
              <View
                key={edge.id}
                style={{
                  position: 'absolute',
                  left: start.x,
                  top: start.y - 1,
                  width: length,
                  height: 2,
                  backgroundColor: '#4A9EE0',
                  transformOrigin: 'left center',
                  transform: [{ rotate: `${angle}deg` }],
                }}
              />
            );
          })}
          
          {renderGrid()}
          
          {/* Nodes */}
          {nodes.map((node) => (
            <DraggableNode 
              key={node.id} 
              node={node} 
              onMove={moveNode}
              onConnectionPointTap={handleConnectionPointTap}
              isConnecting={connectingFrom !== null}
              connectingNodeId={connectingFrom?.nodeId || null}
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
  connectionPoint: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#4A9EE0',
  },
  connectionPointActive: {
    backgroundColor: '#4A9EE0',
    borderColor: '#2E7BB8',
    transform: [{ scale: 1.3 }],
  },
  connectionTop: {
    top: -6,
    left: '50%',
    marginLeft: -6,
  },
  connectionBottom: {
    bottom: -6,
    left: '50%',
    marginLeft: -6,
  },
  connectionLeft: {
    left: -6,
    top: '50%',
    marginTop: -6,
  },
  connectionRight: {
    right: -6,
    top: '50%',
    marginTop: -6,
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
