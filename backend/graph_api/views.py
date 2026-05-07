from rest_framework.decorators import api_view
from rest_framework.response import Response
from .memgraph_client import MemgraphClient

client = MemgraphClient()

@api_view(['GET'])
def get_node(request, node_id):
    result = client.get_node_with_neighbors(node_id)
    if result:
        return Response(result)
    return Response({"error": "Node not found"}, status=404)

@api_view(['POST'])
def add_node(request):
    node_id = request.data.get('id')
    if node_id:
        client.add_node(node_id)
        return Response({"status": "ok"})
    return Response({"error": "No id provided"}, status=400)

@api_view(['POST'])
def add_edge(request):
    from_id = request.data.get('from')
    to_id = request.data.get('to')
    relation = request.data.get('relation')
    
    if from_id and to_id and relation:
        client.add_edge(from_id, to_id, relation)
        return Response({"status": "ok"})
    return Response({"error": "Missing parameters"}, status=400)