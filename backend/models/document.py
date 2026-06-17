from sqlalchemy import Column,Integer,String

class Document(Base):

    __tablename__="documents"

    id = Column(Integer,primary_key=True)

    filename = Column(String)

    status = Column(String)