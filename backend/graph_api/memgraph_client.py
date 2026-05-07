from gqlalchemy import Memgraph
from django.conf import settings
import logging

logger = logging.getLogger(__name__)

class MemgraphClient:
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance.connection = None
            cls._instance.use_mocks = True
            
            try:
                cls._instance.connection = Memgraph(
                    host=getattr(settings, 'MEMGRAPH_HOST', 'localhost'),
                    port=getattr(settings, 'MEMGRAPH_PORT', 7687)
                )
                cls._instance.connection.execute("RETURN 1")
                cls._instance.use_mocks = False
                print("✅ Connected to Memgraph successfully!")
            except Exception as e:
                print(f"⚠️ Could not connect to Memgraph: {e}")
                print("📝 Using MOCK DATA mode for visualization")
                cls._instance.use_mocks = True
                cls._instance.connection = None
                
        return cls._instance
    
    def get_node_with_neighbors(self, node_id):
        mock_data = {
            "k1": {"id": "k1", "neighbors": [{"id": "k2", "label": "гипоним"}, {"id": "k3", "label": "синоним"}, {"id": "k4", "label": "антоним"}, {"id": "k15", "label": "мероним"}, {"id": "k16", "label": "голоним"}]},
            "k2": {"id": "k2", "neighbors": [{"id": "k5", "label": "пример"}, {"id": "k6", "label": "часть"}, {"id": "k1", "label": "гипероним"}]},
            "k3": {"id": "k3", "neighbors": [{"id": "k7", "label": "родственный"}, {"id": "k8", "label": "ассоциация"}, {"id": "k1", "label": "синоним"}]},
            "k4": {"id": "k4", "neighbors": [{"id": "k9", "label": "противоположность"}, {"id": "k1", "label": "антоним"}]},
            
            "k5": {"id": "k5", "neighbors": [{"id": "k10", "label": "конкретизация"}, {"id": "k11", "label": "иллюстрация"}, {"id": "k17", "label": "типичный_случай"}]},
            "k6": {"id": "k6", "neighbors": [{"id": "k2", "label": "целое"}, {"id": "k18", "label": "компонент"}]},
            "k7": {"id": "k7", "neighbors": [{"id": "k12", "label": "коллокация"}, {"id": "k19", "label": "идиома"}]},
            "k8": {"id": "k8", "neighbors": [{"id": "k20", "label": "контекст"}]},
            "k9": {"id": "k9", "neighbors": []},

            "k10": {"id": "k10", "neighbors": [{"id": "k21", "label": "специализация"}, {"id": "k22", "label": "уточнение"}]},
            "k11": {"id": "k11", "neighbors": [{"id": "k23", "label": "метафора"}]},
            "k12": {"id": "k12", "neighbors": [{"id": "k24", "label": "фразеологизм"}, {"id": "k25", "label": "пословица"}]},

            "k13": {"id": "k13", "neighbors": [{"id": "k26", "label": "термин"}, {"id": "k27", "label": "неологизм"}]},
            "k14": {"id": "k14", "neighbors": [{"id": "k28", "label": "архаизм"}, {"id": "k29", "label": "историзм"}]},
            "k15": {"id": "k15", "neighbors": [{"id": "k30", "label": "элемент"}, {"id": "k1", "label": "холоним"}]},
            "k16": {"id": "k16", "neighbors": [{"id": "k1", "label": "мероним"}]},

            "k17": {"id": "k17", "neighbors": []},
            "k18": {"id": "k18", "neighbors": []},
            "k19": {"id": "k19", "neighbors": []},
            "k20": {"id": "k20", "neighbors": []},
            "k21": {"id": "k21", "neighbors": []},
            "k22": {"id": "k22", "neighbors": []},
            "k23": {"id": "k23", "neighbors": []},
            "k24": {"id": "k24", "neighbors": []},
            "k25": {"id": "k25", "neighbors": []},
            "k26": {"id": "k26", "neighbors": []},
            "k27": {"id": "k27", "neighbors": []},
            "k28": {"id": "k28", "neighbors": []},
            "k29": {"id": "k29", "neighbors": []},
            "k30": {"id": "k30", "neighbors": []},
        }
        
        if self.use_mocks or not self.connection:
            result = mock_data.get(node_id)
            if result:
                print(f"📖 Mock data for {node_id}: {result}")
                return result
            return None

        try:
            query = """
            MATCH (n {id: $node_id})
            OPTIONAL MATCH (n)-[r]->(neighbor)
            RETURN n, collect(DISTINCT {id: neighbor.id, label: type(r)}) as neighbors
            """
            results = self.connection.execute_and_fetch(query, {"node_id": node_id})
            for result in results:
                return {
                    "id": result["n"].properties["id"],
                    "neighbors": result["neighbors"] if result["neighbors"] else []
                }
            return None
        except Exception as e:
            return mock_data.get(node_id)
    
    def add_node(self, node_id):
        if not self.use_mocks and self.connection:
            try:
                query = "CREATE (n:Node {id: $node_id}) RETURN n"
                self.connection.execute(query, {"node_id": node_id})
                print(f"✅ Added node: {node_id}")
            except Exception as e:
                print(f"❌ Error adding node: {e}")
        else:
            print(f"📝 Mock mode: would add node {node_id}")
    
    def add_edge(self, from_id, to_id, relation_type):
        if not self.use_mocks and self.connection:
            try:
                query = """
                MATCH (a {id: $from_id}), (b {id: $to_id})
                CREATE (a)-[r:RELATION {type: $relation_type}]->(b)
                RETURN r
                """
                self.connection.execute(query, {
                    "from_id": from_id,
                    "to_id": to_id,
                    "relation_type": relation_type
                })
                print(f"✅ Added edge: {from_id} -{relation_type}-> {to_id}")
            except Exception as e:
                print(f"❌ Error adding edge: {e}")
        else:
            print(f"📝 Mock mode: would add edge {from_id} -{relation_type}-> {to_id}")